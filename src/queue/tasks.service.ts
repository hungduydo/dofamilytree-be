import { Injectable, Logger, Inject } from '@nestjs/common';
import { errorAttributes, logEvent, logEventThrottled } from '../observability/log-event';
import { PrismaService } from '../prisma/prisma.service';
import { Redis as UpstashRedis } from '@upstash/redis';
import { REDIS_DURABLE_CLIENT } from '../redis.provider';
import { GenerationService } from '../generation/generation.service';
import { StorageService } from '../storage/storage.service';
import {
  mediaProgressKey, MEDIA_PROGRESS_TTL, MEDIA_CACHE_KEYS, mediaDriveTokenKey,
} from '../media/media.cache-keys';
import { filenameForMime, optimizeImage } from '../media/image-optimize';
import { storageKeyFor, MAX_DRIVE_IMPORT_BYTES, formatBytes } from '../media/media.constants';
import { downloadDriveFile, DriveApiError, DriveFileTooLargeError, fromStoredDriveAuth } from '../media/google-drive';
import { computeTreeStats } from '../tree/tree-stats';
import { CACHE_KEY_STATS, CACHE_TTL } from '../tree/tree.cache-keys';
import { MailService } from '../mail/mail.service';
import { SupabaseUsersService } from '../supabase/supabase-users.service';
import { buildPendingAccountEmail, type ClaimRequest } from '../auth/pending-account-email';

export type MediaUploadProgress = {
  status: 'pending' | 'processing' | 'ready' | 'failed';
  progress: number;
  url?: string;
  error?: string;
};

/** Payload job `drive-import` — KHÔNG chứa token/key (auth nằm trong Redis theo batchId). */
export type DriveImportJob = {
  mediaId: string;
  batchId: string;
  driveFileId: string;
  filename: string;
  mimetype: string;
};

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: UpstashRedis,
    private readonly generationService: GenerationService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly supabaseUsers: SupabaseUsersService,
    @Inject(REDIS_DURABLE_CLIENT) private readonly durableRedis: UpstashRedis,
  ) {}

  /**
   * Ghi progress best-effort — KHÔNG BAO GIỜ được làm hỏng quá trình upload
   * chỉ vì Redis chết (cùng triết lý SafeCache: cache là tối ưu hoá).
   */
  private async setMediaProgress(mediaId: string, data: MediaUploadProgress): Promise<void> {
    try {
      await this.redis.set(mediaProgressKey(mediaId), JSON.stringify(data), { ex: MEDIA_PROGRESS_TTL });
    } catch (err) {
      this.logger.warn(`Redis SET progress ${mediaId} failed (non-fatal): ${(err as Error).message}`);
      logEventThrottled('cache.degraded', 'warn', 'Cache degraded, falling back', {
        'cache.component': 'media-progress',
        'cache.operation': 'set',
        ...errorAttributes(err),
      }, 'media-progress:set');
    }
  }

  async handleAvatarUpload(data: { memberId: string; buffer: { type: string; data: number[] } | string; filename: string; mimetype: string }) {
    const { memberId, buffer, filename, mimetype } = data;
    this.logger.log(`Processing avatar upload for member ${memberId}`);

    const bufferObj = typeof buffer === 'string' 
      ? Buffer.from(buffer, 'base64') 
      : Buffer.from(buffer.data);

    try {
      const url = await this.storage.put(`avatars/${memberId}/${filename}`, bufferObj, mimetype);

      await this.prisma.member.update({
        where: { id: memberId },
        data: { avatar_url: url },
      });

      this.logger.log(`Avatar uploaded successfully for member ${memberId}: ${url}`);
    } catch (error) {
      this.logger.error(`Failed to upload avatar for member ${memberId}`, error);
      throw error;
    }
  }

  async handleReportGenerate() {
    this.logger.log('Generating family tree report...');

    try {
      // Dùng chung với TreeService.computeStats() nên cache hit luôn đủ field.
      const report = await computeTreeStats(this.prisma);

      await this.redis.set(CACHE_KEY_STATS, JSON.stringify(report), { ex: CACHE_TTL });
      this.logger.log(`Report generated and cached: ${report.totalMembers} members`);
    } catch (error) {
      this.logger.error('Failed to generate report', error);
      throw error;
    }
  }

  /**
   * Tính lại `members.generation` cho toàn bộ thành viên. Giữ mỏng — logic nằm
   * trong `GenerationService` để test được mà không phải dựng cả queue.
   */
  async handleGenerationRecompute() {
    return this.generationService.recomputeAll();
  }

  /**
   * Báo cho mọi admin rằng có một tài khoản mới đang chờ duyệt.
   *
   * Lỗi gửi mail thì NÉM để QStash retry. Hai trường hợp KHÔNG ném, vì retry
   * không bao giờ sửa được: tài khoản đã được duyệt/xoá trước khi job chạy, và
   * mail chưa cấu hình (thiếu env — phải deploy lại mới hết).
   */
  async handleAccountPending(data: { userId: string }) {
    const meta = await this.prisma.userMetadata.findUnique({ where: { user_id: data.userId } });
    if (!meta || meta.profile_member_id || meta.deactivated_at) {
      this.logger.log(`Tài khoản ${data.userId} không còn chờ duyệt — bỏ qua email báo admin`);
      return;
    }

    if (!this.mail.isConfigured()) {
      this.logger.error(
        `Không báo được admin về tài khoản chờ duyệt ${data.userId}: thiếu RESEND_API_KEY/MAIL_FROM`,
      );
      return;
    }

    const [admins, pendingCount, registrantEmail] = await Promise.all([
      this.prisma.userMetadata.findMany({
        where: { roles: { has: 'admin' }, deactivated_at: null },
        select: { user_id: true },
      }),
      this.prisma.userMetadata.count({ where: { profile_member_id: null, deactivated_at: null } }),
      this.supabaseUsers.getEmail(data.userId),
    ]);

    const recipients = (
      await Promise.all(admins.map((admin) => this.supabaseUsers.getEmail(admin.user_id)))
    ).filter((email): email is string => Boolean(email));

    if (recipients.length === 0) {
      // Có admin mà không đọc được email nào → Supabase đang hỏng, retry có ích.
      // Không có admin nào → hệ thống chưa bootstrap:admin, xem docs/DEPLOY.md.
      throw new Error(
        admins.length === 0
          ? 'Không có tài khoản admin nào để báo — chạy pnpm bootstrap:admin'
          : `Không đọc được email của ${admins.length} admin từ Supabase`,
      );
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');

    await this.mail.send(
      buildPendingAccountEmail({
        to: recipients,
        registrantEmail,
        claim: (meta.claim_request ?? {}) as ClaimRequest,
        pendingCount,
        reviewUrl: `${frontendUrl}/bo/users`,
      }),
    );
  }

  async handleNotification(data: { type: string; message: string; payload?: any }) {
    this.logger.log(`Notification event: [${data.type}] ${data.message}`);
    // Future: send email or push notification
  }

  /**
   * Xử lý mọi loại media off-request: ẢNH → thu nhỏ + nén rồi lên storage; video /
   * audio / tài liệu → upload thẳng. Cập nhật record sang `ready` (kèm size mới),
   * hoặc `failed` khi lỗi để record không kẹt vĩnh viễn ở `pending`.
   */
  async handleMediaProcess(data: {
    mediaId: string;
    buffer: { type: string; data: number[] } | string;
    filename: string;
    mimetype: string;
  }) {
    const { mediaId, buffer, filename, mimetype } = data;
    const bufferObj =
      typeof buffer === 'string' ? Buffer.from(buffer, 'base64') : Buffer.from(buffer.data);
    await this.setMediaProgress(mediaId, { status: 'processing', progress: 10 });
    return this.processAndStore(mediaId, bufferObj, filename, mimetype);
  }

  /**
   * Phần chung của mọi luồng có buffer trong tay (multipart, import Drive): nén
   * ảnh → lên storage → record `ready`. Lỗi ⇒ đánh dấu `failed` rồi NÉM lại.
   */
  private async processAndStore(mediaId: string, input: Buffer, filename: string, mimetype: string) {
    this.logger.log(`Processing media ${mediaId} (${mimetype})`);
    const startedAt = Date.now();

    try {
      // Ảnh: thu về ≤ MAX_IMAGE_DIMENSION px (4K) và chuyển sang WebP, THAY bản
      // gốc — nên key storage, Content-Type và `mime_type` đi theo bản WebP.
      const image = mimetype.startsWith('image/') ? await optimizeImage(input, mimetype) : null;
      const outBuffer = image?.buffer ?? input;
      const outMime = image?.mimetype ?? mimetype;

      await this.setMediaProgress(mediaId, { status: 'processing', progress: 50 });

      const url = await this.storage.put(
        storageKeyFor(mediaId, filenameForMime(filename, outMime)),
        outBuffer,
        outMime,
      );

      await this.setMediaProgress(mediaId, { status: 'processing', progress: 90 });

      await this.prisma.media.update({
        where: { id: mediaId },
        data: {
          file_path: url,
          size_bytes: outBuffer.length,
          status: 'ready',
          ...(outMime !== mimetype ? { mime_type: outMime } : {}),
        },
      });

      await this.setMediaProgress(mediaId, { status: 'ready', progress: 100, url });
      // `/media/stats` chỉ đếm record `ready`, mà lần lật sang `ready` xảy ra Ở
      // ĐÂY chứ không phải lúc tạo record — invalidate ở uploadMedia (lúc còn
      // `pending`) không đụng gì tới con số stats. Không xoá ở đây thì stats
      // giữ giá trị cũ tới hết TTL (5 phút): người dùng upload xong, số liệu
      // đứng im.
      await this.invalidateMediaStatsCache();
      this.logger.log(`Media ${mediaId} processed and uploaded: ${url}`);
      // Không đưa `url` vào: chỉ cần id để tra ngược; số đo giúp theo dõi tỉ lệ nén.
      logEvent('media.processed', 'info', 'Media processed', {
        'media.id': mediaId,
        'media.mime_type': mimetype,
        'media.output_mime_type': outMime,
        'media.input_bytes': input.length,
        'media.output_bytes': outBuffer.length,
        ...(image?.width ? { 'media.width': image.width, 'media.height': image.height } : {}),
        'media.duration_ms': Date.now() - startedAt,
      });
    } catch (error) {
      this.logger.error(`Failed to process media ${mediaId}`, error);
      logEvent('media.processing_failed', 'error', 'Media processing failed', {
        'media.id': mediaId,
        'media.mime_type': mimetype,
        'media.input_bytes': input.length,
        ...errorAttributes(error),
      });
      await this.markMediaFailed(mediaId, (error as Error).message);
      throw error;
    }
  }

  /**
   * Đánh dấu failed để record không kẹt ở pending/processing; nuốt lỗi update
   * để không che mất lỗi gốc.
   */
  private async markMediaFailed(mediaId: string, error: string): Promise<void> {
    await this.prisma.media
      .update({ where: { id: mediaId }, data: { status: 'failed' } })
      .catch(() => {});
    await this.setMediaProgress(mediaId, { status: 'failed', progress: 100, error });
  }

  /**
   * Kéo MỘT file từ Google Drive về storage, rồi đi chung đường nén/lưu với
   * multipart. Chạy qua QStash (production) hoặc thẳng trong process (dev).
   *
   * Quy ước ném lỗi — quyết định QStash có retry hay không:
   * - Lỗi tạm (mạng, 429, 5xx Drive, storage) ⇒ đánh dấu failed rồi NÉM ⇒ QStash
   *   gọi lại; lần sau thấy `failed` (khác `ready`) nên chạy lại từ đầu.
   * - Lỗi vĩnh viễn (token hết hạn, mất quyền, file quá lớn, thiếu key server)
   *   ⇒ failed và KHÔNG ném: retry chỉ tốn lượt và ra cùng kết quả.
   *
   * Chỉ batch dùng token người dùng mới có `token_expired`; batch link chia sẻ
   * không có gì để hết hạn.
   */
  async handleDriveImport(job: DriveImportJob): Promise<void> {
    const { mediaId, batchId, driveFileId, filename, mimetype } = job;

    const media = await this.prisma.media.findUnique({ where: { id: mediaId }, select: { status: true } });
    if (!media) {
      // Admin xoá record trong lúc job đang xếp hàng — không còn gì để làm.
      this.logger.warn(`Drive import: media ${mediaId} không còn tồn tại — bỏ qua`);
      return;
    }
    // QStash giao "ít nhất một lần" — lần giao lặp sau khi đã xong là no-op.
    if (media.status === 'ready') return;

    await this.setMediaProgress(mediaId, { status: 'processing', progress: 5 });

    let stored: unknown;
    try {
      stored = await this.durableRedis.get<unknown>(mediaDriveTokenKey(batchId));
    } catch (error) {
      // Không đọc được ≠ hết hạn. Đánh dấu failed (để record không kẹt ở
      // `processing` khi chạy inline) rồi NÉM để QStash retry.
      await this.failDriveImport(job, 'redis_unavailable', 'Hệ thống hàng đợi tạm thời lỗi — đang thử lại.', error);
      throw error;
    }
    const restored = fromStoredDriveAuth(stored);
    if ('error' in restored) {
      if (restored.error === 'not_configured') {
        await this.failDriveImport(job, 'not_configured', 'Import từ link Google Drive chưa được cấu hình.');
      } else {
        await this.failDriveImport(job, 'token_expired', 'Phiên Google Drive đã hết hạn — hãy chọn lại ảnh để import.');
      }
      return;
    }
    const { auth } = restored;

    let buffer: Buffer;
    try {
      buffer = await downloadDriveFile(auth, driveFileId, MAX_DRIVE_IMPORT_BYTES);
    } catch (error) {
      if (error instanceof DriveFileTooLargeError) {
        await this.failDriveImport(
          job, 'too_large', `File vượt quá giới hạn ${formatBytes(MAX_DRIVE_IMPORT_BYTES)} cho import từ Google Drive.`,
        );
        return;
      }
      if (error instanceof DriveApiError && !error.retryable) {
        if (auth.kind === 'token' && error.isAuthError) {
          await this.failDriveImport(job, 'token_expired', 'Phiên Google Drive đã hết hạn — hãy chọn lại ảnh để import.', error);
        } else {
          const message =
            auth.kind === 'token'
              ? 'Không đọc được file trên Google Drive (đã bị xoá hoặc mất quyền truy cập).'
              : "Không đọc được file trên Google Drive — file đã bị xoá hoặc không còn chia sẻ 'Bất kỳ ai có đường liên kết'.";
          await this.failDriveImport(job, 'drive_forbidden', message, error);
        }
        return;
      }
      await this.failDriveImport(job, 'drive_unavailable', 'Google Drive tạm thời lỗi — đang thử lại.', error);
      throw error;
    }

    await this.setMediaProgress(mediaId, { status: 'processing', progress: 30 });
    await this.processAndStore(mediaId, buffer, filename, mimetype);
  }

  private async failDriveImport(
    job: DriveImportJob,
    reason:
      | 'token_expired' | 'not_configured' | 'too_large' | 'drive_forbidden' | 'drive_unavailable'
      | 'redis_unavailable',
    message: string,
    error?: unknown,
  ): Promise<void> {
    this.logger.warn(`Drive import ${job.mediaId} failed (${reason}): ${(error as Error | undefined)?.message ?? message}`);
    logEvent('media.drive_import.failed', reason === 'drive_unavailable' || reason === 'redis_unavailable' ? 'warn' : 'error', 'Google Drive import failed', {
      'media.id': job.mediaId,
      'media.mime_type': job.mimetype,
      'media.reason': reason,
      'media.batch_id': job.batchId,
      'http.response.status_code': error instanceof DriveApiError ? error.status : undefined,
      ...(error ? errorAttributes(error) : {}),
    });
    await this.markMediaFailed(job.mediaId, message);
  }

  /**
   * Best-effort: Redis chết không được làm hỏng một upload đã thành công — cùng
   * triết lý với `setMediaProgress`. Số liệu sai tối đa 5 phút vẫn hơn là ném
   * lỗi rồi đánh dấu media `failed` trong khi file đã nằm trên storage.
   */
  private async invalidateMediaStatsCache(): Promise<void> {
    try {
      await this.redis.del(...MEDIA_CACHE_KEYS);
    } catch (error) {
      this.logger.warn(`Không xoá được cache media stats: ${(error as Error).message}`);
    }
  }

  /** Alias tương thích với callback QStash cũ (`image-process`). */
  async handleImageProcess(data: {
    mediaId: string;
    buffer: { type: string; data: number[] } | string;
    filename: string;
    mimetype: string;
  }) {
    return this.handleMediaProcess(data);
  }
}

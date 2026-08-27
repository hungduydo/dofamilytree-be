import {
  Injectable, NotFoundException, Inject, Logger,
  BadRequestException, PayloadTooLargeException, ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Redis as UpstashRedis } from '@upstash/redis';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService, MediaUploadProgress } from '../queue/tasks.service';
import { StorageService } from '../storage/storage.service';
import { runInBackground } from '../utils/run-in-background';
import { SafeCache } from '../utils/safe-cache';
import { removeVietnameseTones } from '../utils/vietnamese-helper';
import { MEDIA_CARD_SELECT } from './media.select';
import {
  CACHE_KEY_MEDIA_STATS,
  CACHE_KEY_MEDIA_ALBUMS,
  MEDIA_CACHE_KEYS,
  MEDIA_CACHE_TTL_STATS,
  MEDIA_CACHE_TTL_ALBUMS,
  mediaProgressKey,
  MEDIA_PROGRESS_TTL,
} from './media.cache-keys';
import {
  MEDIA_SORT_FIELDS,
  MEDIA_TYPES,
  MediaSortField,
  SortOrder,
  MediaType,
  classifyMediaType,
  isAllowedMime,
  formatBytes,
  storageKeyFor,
  MAX_UPLOAD_BYTES,
  VERCEL_BODY_LIMIT_BYTES,
  STORAGE_QUOTA_BYTES,
  MAX_PRESIGNED_BYTES,
  PRESIGN_EXPIRES_SECONDS,
} from './media.constants';

export interface MediaStats {
  total: number;
  images: number;
  videos: number;
  audios: number;
  documents: number;
  /**
   * Record `ready` nhưng thiếu `type` — dữ liệu cũ chưa backfill. Không thuộc
   * bucket nào ở trên, nên `images+videos+audios+documents+untyped === total`.
   */
  untyped: number;
  storageUsedBytes: number;
  storageQuotaBytes: number;
  /** Số record `ready` thiếu `size_bytes` ⇒ `storageUsedBytes` đang thiếu hụt. */
  mediaMissingSize: number;
}

export interface GetMediaQuery {
  page?: number;
  pageSize?: number;
  type?: string;
  album_id?: string;
  member_id?: string;
  uploader_id?: string;
  event_id?: string;
  tag?: string;
  from?: string;
  to?: string;
  q?: string;
  sortBy?: MediaSortField;
  sortOrder?: SortOrder;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly cache: SafeCache;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly storage: StorageService,
    @Inject('REDIS_CLIENT') private readonly redis: UpstashRedis,
  ) {
    this.cache = new SafeCache(this.redis, this.logger, MEDIA_CACHE_TTL_ALBUMS);
    this.warnIfUploadLimitUnreachable();
  }

  /**
   * Cảnh báo khi `MAX_UPLOAD_BYTES` cao hơn trần request body của Vercel: lúc đó
   * file trong khoảng giữa hai trần bị Vercel chặn TRƯỚC khi tới đây, nên client
   * nhận 413 lạ của platform thay vì message tiếng Việt của ta — triệu chứng rất
   * khó chẩn đoán nếu không được nói ra ở log.
   */
  private warnIfUploadLimitUnreachable(): void {
    if (!process.env.VERCEL) return;
    const platformLimit = process.env.MEDIA_FLUID_COMPUTE_ENABLED === 'true'
      ? VERCEL_BODY_LIMIT_BYTES.withFluid
      : VERCEL_BODY_LIMIT_BYTES.withoutFluid;
    if (MAX_UPLOAD_BYTES > platformLimit) {
      this.logger.warn(
        `MAX_UPLOAD_BYTES (${formatBytes(MAX_UPLOAD_BYTES)}) > trần request body của Vercel ` +
        `(${formatBytes(platformLimit)}). File ở giữa hai mức sẽ bị platform chặn với 413 ` +
        `không đọc được. Bật Fluid Compute (và đặt MEDIA_FLUID_COMPUTE_ENABLED=true), ` +
        `hoặc hướng client sang POST /v2/media/upload-url.`,
      );
    }
  }

  async uploadMedia(
    file: Express.Multer.File,
    uploaderId: string,
    meta: {
      title?: string;
      type?: string;
      member_id?: string;
      album_id?: string;
      event_id?: string;
      uploader_name?: string;
      duration_seconds?: number;
      tags?: string[];
    } = {},
  ) {
    const title = meta.title ?? file.originalname;
    // `type` tường minh (nếu hợp lệ) thắng; ngược lại suy từ MIME.
    const type: MediaType =
      meta.type && (MEDIA_TYPES as readonly string[]).includes(meta.type)
        ? (meta.type as MediaType)
        : classifyMediaType(file.mimetype);

    // Tạo record pending — trả về ngay, upload lên Blob chạy off-request.
    const media = await this.prisma.media.create({
      data: {
        file_path: `/pending/${Date.now()}_${file.originalname}`,
        uploader_id: uploaderId,
        uploader_name: meta.uploader_name,
        title,
        normalized_title: removeVietnameseTones(title),
        type,
        mime_type: file.mimetype,
        member_id: meta.member_id,
        album_id: meta.album_id,
        event_id: meta.event_id,
        duration_seconds: meta.duration_seconds,
        tags: meta.tags ?? [],
        size_bytes: file.size ?? null,
        status: 'pending',
      },
    });

    // Progress ban đầu — để client poll /media/:id/progress ngay sau response
    // này thấy 'pending' thay vì fallback DB (tránh 1 round-trip Postgres thừa).
    await this.cache.set(mediaProgressKey(media.id), { status: 'pending', progress: 0 }, MEDIA_PROGRESS_TTL);

    // Gọi TRỰC TIẾP handler off-request (giống avatar ở members.service), KHÔNG
    // qua QStash: payload base64 của ảnh lớn/video vượt trần message QStash, và
    // callback QStash cần APP_URL public mà dev-local không có.
    runInBackground(
      this.tasksService.handleMediaProcess({
        mediaId: media.id,
        buffer: file.buffer.toString('base64'),
        filename: file.originalname,
        mimetype: file.mimetype,
      }),
    );

    // Upload đổi total + storage → xoá cache stats/albums.
    await this.invalidateMediaCaches();

    return media;
  }

  /**
   * Cấp presigned PUT URL cho client upload THẲNG lên storage.
   *
   * Lý do tồn tại: multipart `POST /media/upload` đẩy toàn bộ file qua serverless
   * function, nên bị chặn bởi trần request body của platform (4.5MB không Fluid,
   * 100MB có Fluid) — trần đó nằm NGOÀI tầm kiểm soát của code. Đường này file
   * không chạm function nên không dính trần nào.
   *
   * Đánh đổi: server không cầm buffer nên KHÔNG nén ảnh lossless như luồng
   * multipart. Ảnh nhỏ vẫn nên đi `POST /media/upload` để được nén; đường này
   * dành cho audio/video/file lớn vốn dĩ không nén ở server.
   */
  async createUploadUrl(
    uploaderId: string,
    dto: {
      filename: string;
      mime_type: string;
      size_bytes: number;
      title?: string;
      type?: string;
      member_id?: string;
      album_id?: string;
      event_id?: string;
      uploader_name?: string;
      duration_seconds?: number;
      tags?: string[];
    },
  ) {
    if (!this.storage.supportsPresign()) {
      throw new ServiceUnavailableException(
        'Storage provider hiện tại không hỗ trợ upload trực tiếp. Dùng POST /v2/media/upload.',
      );
    }
    // Cùng allowlist với luồng multipart — presigned URL không được là cửa sau
    // để đẩy mime tuỳ ý lên bucket.
    if (!isAllowedMime(dto.mime_type)) {
      throw new BadRequestException(`Unsupported file type: ${dto.mime_type}`);
    }
    if (dto.size_bytes > MAX_PRESIGNED_BYTES) {
      throw new PayloadTooLargeException(
        `File vượt quá giới hạn ${formatBytes(MAX_PRESIGNED_BYTES)}.`,
      );
    }

    const title = dto.title ?? dto.filename;
    const type: MediaType =
      dto.type && (MEDIA_TYPES as readonly string[]).includes(dto.type)
        ? (dto.type as MediaType)
        : classifyMediaType(dto.mime_type);

    const media = await this.prisma.media.create({
      data: {
        // Chưa biết URL cho tới khi client PUT xong — giữ marker `/pending/`
        // giống luồng multipart để record dở dang luôn nhận diện được.
        file_path: `/pending/${Date.now()}_${dto.filename}`,
        uploader_id: uploaderId,
        uploader_name: dto.uploader_name,
        title,
        normalized_title: removeVietnameseTones(title),
        type,
        mime_type: dto.mime_type,
        member_id: dto.member_id,
        album_id: dto.album_id,
        event_id: dto.event_id,
        duration_seconds: dto.duration_seconds,
        tags: dto.tags ?? [],
        size_bytes: dto.size_bytes,
        status: 'pending',
      },
    });

    const path = storageKeyFor(media.id, dto.filename);
    const uploadUrl = await this.storage.presignPut(path, dto.mime_type, PRESIGN_EXPIRES_SECONDS);

    await this.cache.set(
      mediaProgressKey(media.id),
      { status: 'pending', progress: 0 },
      MEDIA_PROGRESS_TTL,
    );

    return {
      media_id: media.id,
      upload_url: uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': dto.mime_type },
      expires_in: PRESIGN_EXPIRES_SECONDS,
      public_url: this.storage.publicUrlFor(path),
    };
  }

  /**
   * Chốt một upload presigned: XÁC MINH object đã có thật trên storage rồi mới
   * chuyển record sang `ready`.
   *
   * Cố ý không tin `size_bytes` client khai ở bước xin URL — client có thể bỏ
   * ngang giữa chừng, hoặc PUT file khác size. `headSize` là nguồn sự thật.
   */
  async completeUpload(mediaId: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException(`Media ${mediaId} not found`);
    if (media.status === 'ready') return media;

    const filename = media.file_path.replace(/^\/pending\/\d+_/, '');
    const path = storageKeyFor(media.id, filename);

    const size = await this.storage.headSize(path);
    if (size === null) {
      throw new BadRequestException(
        'Chưa thấy file trên storage — hãy PUT file lên upload_url trước khi gọi complete.',
      );
    }

    const url = this.storage.publicUrlFor(path);
    const updated = await this.prisma.media.update({
      where: { id: mediaId },
      data: { file_path: url, size_bytes: size, status: 'ready' },
    });

    await this.cache.set(
      mediaProgressKey(mediaId),
      { status: 'ready', progress: 100, url },
      MEDIA_PROGRESS_TTL,
    );
    await this.invalidateMediaCaches();

    this.logger.log(`Media ${mediaId} completed via presigned upload: ${url}`);
    return updated;
  }

  /**
   * Progress upload — đọc Redis trước (nhanh, cập nhật theo từng bước xử lý ở
   * TasksService). Nếu key đã hết hạn (upload xong từ lâu / Redis lỗi), fallback
   * đọc `status` từ Postgres — nguồn sự thật cuối cùng, luôn đúng dù mất progress
   * chi tiết.
   */
  async getUploadProgress(id: string): Promise<MediaUploadProgress> {
    const cached = await this.cache.get<MediaUploadProgress>(mediaProgressKey(id));
    if (cached) return cached;

    const media = await this.prisma.media.findUnique({
      where: { id },
      select: { status: true, file_path: true },
    });
    if (!media) throw new NotFoundException(`Media ${id} not found`);

    if (media.status === 'ready') return { status: 'ready', progress: 100, url: media.file_path };
    if (media.status === 'failed') return { status: 'failed', progress: 100 };
    return { status: 'pending', progress: 0 };
  }

  /**
   * Danh sách phân trang + lọc + sắp xếp + tìm kiếm cho lưới "Thư viện media".
   * Mặc định chỉ trả record `ready` (ẩn pending/failed khỏi thư viện công khai).
   */
  async getMedia(query: GetMediaQuery) {
    const take = Math.min(Math.max(query.pageSize ?? 12, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const skip = (page - 1) * take;

    const where: Prisma.MediaWhereInput = { status: 'ready' };
    if (query.type && (MEDIA_TYPES as readonly string[]).includes(query.type)) where.type = query.type;
    if (query.album_id) where.album_id = query.album_id;
    if (query.member_id) where.member_id = query.member_id;
    if (query.uploader_id) where.uploader_id = query.uploader_id;
    if (query.event_id) where.event_id = query.event_id;
    if (query.tag) where.tags = { has: query.tag };

    const createdAt = this.dateRangeWhere(query.from, query.to);
    if (createdAt) where.created_at = createdAt;

    const search = this.titleSearchWhere(query.q);
    if (search) where.OR = search;

    const field: MediaSortField = MEDIA_SORT_FIELDS.includes(query.sortBy as MediaSortField)
      ? (query.sortBy as MediaSortField)
      : 'created_at';
    const order: SortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    // Luôn có tiebreaker `id`: sắp trên cột ít giá trị (views) mà không có khoá
    // phụ sẽ sinh dòng trùng/thiếu giữa các trang.
    const orderBy: Prisma.MediaOrderByWithRelationInput[] = [
      { [field]: order } as Prisma.MediaOrderByWithRelationInput,
      { id: 'asc' },
    ];

    const [data, total] = await Promise.all([
      this.prisma.media.findMany({ where, skip, take, orderBy, select: MEDIA_CARD_SELECT }),
      this.prisma.media.count({ where }),
    ]);

    return { data, total, page, pageSize: take };
  }

  private titleSearchWhere(q?: string): Prisma.MediaWhereInput[] | undefined {
    if (!q?.trim()) return undefined;
    const normalized = removeVietnameseTones(q);
    return [
      { normalized_title: { contains: normalized, mode: 'insensitive' } },
      { title: { contains: q, mode: 'insensitive' } },
    ];
  }

  private dateRangeWhere(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    const filter: Prisma.DateTimeFilter = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) filter.gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) filter.lte = d;
    }
    return Object.keys(filter).length ? filter : undefined;
  }

  /**
   * Thống kê thư viện: đếm theo loại + tổng dung lượng, trong MỘT lượt quét
   * (mẫu getMemberStats). Chỉ tính record `ready`. Ép bigint→Number vì COUNT/SUM
   * của Postgres là int8 → Prisma trả BigInt → JSON.stringify ném lỗi.
   *
   * Các bucket đếm PHẢI khớp đúng điều kiện lọc của `getMedia` (`where.type = ?`),
   * nếu không UI sẽ hiện "7 tài liệu" rồi bấm vào tab Tài liệu lại ra rỗng. Vì
   * vậy KHÔNG gộp `type IS NULL` vào documents nữa — record thiếu `type` là dữ
   * liệu bẩn cần backfill (scripts/backfill-media-metadata.ts), không phải tài
   * liệu. `untyped` được trả ra tường minh để chỗ bẩn nhìn thấy được thay vì bị
   * giấu vào một bucket sai.
   */
  async getMediaStats(): Promise<MediaStats> {
    const cached = await this.cache.get<MediaStats>(CACHE_KEY_MEDIA_STATS);
    if (cached) return cached;

    const [row] = await this.prisma.$queryRaw<
      Array<{
        total: bigint;
        images: bigint;
        videos: bigint;
        audios: bigint;
        documents: bigint;
        untyped: bigint;
        missing_size: bigint;
        storage_used: bigint;
      }>
    >`
      SELECT
        COUNT(*)                                                  AS total,
        COUNT(*) FILTER (WHERE type = 'image')                    AS images,
        COUNT(*) FILTER (WHERE type = 'video')                    AS videos,
        COUNT(*) FILTER (WHERE type = 'audio')                    AS audios,
        COUNT(*) FILTER (WHERE type = 'document')                 AS documents,
        COUNT(*) FILTER (WHERE type IS NULL)                      AS untyped,
        COUNT(*) FILTER (WHERE size_bytes IS NULL)                AS missing_size,
        COALESCE(SUM(size_bytes), 0)                              AS storage_used
      FROM media
      WHERE status = 'ready'
    `;

    const result: MediaStats = {
      total: Number(row.total),
      images: Number(row.images),
      videos: Number(row.videos),
      audios: Number(row.audios),
      documents: Number(row.documents),
      untyped: Number(row.untyped),
      storageUsedBytes: Number(row.storage_used),
      storageQuotaBytes: STORAGE_QUOTA_BYTES,
      // `storageUsedBytes` chỉ cộng được record có size_bytes. Đếm số record
      // thiếu size để client biết con số đang thiếu hụt thay vì tưởng là đủ.
      mediaMissingSize: Number(row.missing_size),
    };

    await this.cache.set(CACHE_KEY_MEDIA_STATS, result, MEDIA_CACHE_TTL_STATS);
    return result;
  }

  async incrementViews(id: string) {
    try {
      const media = await this.prisma.media.update({
        where: { id },
        data: { views: { increment: 1 } },
        select: { views: true },
      });
      return { views: media.views };
    } catch {
      // Prisma ném P2025 khi id không tồn tại.
      throw new NotFoundException(`Media ${id} not found`);
    }
  }

  /**
   * Tổng dung lượng thực tế trên (các) storage provider ĐÃ CẤU HÌNH, quét trực
   * tiếp qua API list (khác `getMediaStats` — vốn SUM `size_bytes` trong DB,
   * nhanh nhưng có thể lệch nếu có file mồ côi hoặc record thiếu size_bytes).
   * Không cache vì đây là thao tác đối chiếu/kiểm tra, không phải path hiển thị
   * thường xuyên.
   */
  async getBlobStorageUsage(): Promise<{ totalBytes: number; totalFiles: number }> {
    return this.storage.getUsage();
  }

  // ─── Albums ─────────────────────────────────────────────────────────────────

  /** Albums với số media, cho lưới "Album nổi bật". Cache (đổi hiếm). */
  async getAlbums(limit?: number) {
    // Chỉ cache danh sách đầy đủ (limit không truyền); biến thể có limit lấy từ
    // đó rồi cắt, để một khoá cache phục vụ cả hai.
    const cached = await this.cache.get<Array<{ count: number } & Record<string, unknown>>>(
      CACHE_KEY_MEDIA_ALBUMS,
    );
    if (cached) return typeof limit === 'number' ? cached.slice(0, limit) : cached;

    const albums = await this.prisma.mediaAlbum.findMany({
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { media: true } } },
    });
    const result = albums.map(({ _count, ...a }) => ({ ...a, count: _count.media }));

    await this.cache.set(CACHE_KEY_MEDIA_ALBUMS, result, MEDIA_CACHE_TTL_ALBUMS);
    return typeof limit === 'number' ? result.slice(0, limit) : result;
  }

  async createAlbum(data: { name: string; description?: string; cover_url?: string; date?: string }) {
    const album = await this.prisma.mediaAlbum.create({ data });
    await this.invalidateMediaCaches();
    return album;
  }

  async deleteAlbum(id: string) {
    // Gỡ liên kết media khỏi album, rồi xoá album.
    await this.prisma.media.updateMany({ where: { album_id: id }, data: { album_id: null } });
    const album = await this.prisma.mediaAlbum.delete({ where: { id } });
    await this.invalidateMediaCaches();
    return album;
  }

  /** Tài liệu/ảnh gắn với một thành viên ("Tài liệu liên quan"). */
  async getMemberMedia(memberId: string) {
    return this.prisma.media.findMany({
      where: { member_id: memberId },
      orderBy: { created_at: 'desc' },
      select: MEDIA_CARD_SELECT,
    });
  }

  async deleteMedia(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException(`Media ${id} not found`);

    // Xoá file trên storage provider tương ứng (route theo ownership của URL).
    if (media.file_path.startsWith('https://')) {
      await this.storage.del(media.file_path);
    }

    const deleted = await this.prisma.media.delete({ where: { id } });
    await this.invalidateMediaCaches();
    return deleted;
  }

  /**
   * Xoá cache stats/albums sau một lần ghi. PHẢI await, KHÔNG fire-and-forget:
   * trên Vercel serverless function có thể đóng băng ngay khi response ghi xong
   * ⇒ DEL không await có thể không bao giờ chạy, và race với GET đồng thời đang
   * re-populate giá trị cũ (xem members.service invalidateMemberCaches).
   */
  private invalidateMediaCaches(): Promise<void> {
    return this.cache.del(...MEDIA_CACHE_KEYS);
  }
}

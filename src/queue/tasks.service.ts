import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { put } from '@vercel/blob';
import { Redis as UpstashRedis } from '@upstash/redis';
import sharp from 'sharp';
import { GenerationService } from '../generation/generation.service';
import { mediaProgressKey, MEDIA_PROGRESS_TTL } from '../media/media.cache-keys';

export type MediaUploadProgress = {
  status: 'pending' | 'processing' | 'ready' | 'failed';
  progress: number;
  error?: string;
};

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: UpstashRedis,
    private readonly generationService: GenerationService,
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
    }
  }

  async handleAvatarUpload(data: { memberId: string; buffer: { type: string; data: number[] } | string; filename: string; mimetype: string }) {
    const { memberId, buffer, filename, mimetype } = data;
    this.logger.log(`Processing avatar upload for member ${memberId}`);

    const bufferObj = typeof buffer === 'string' 
      ? Buffer.from(buffer, 'base64') 
      : Buffer.from(buffer.data);

    try {
      const blob = await put(`avatars/${memberId}/${filename}`, bufferObj, {
        access: 'public',
        contentType: mimetype,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      await this.prisma.member.update({
        where: { id: memberId },
        data: { avatar_url: blob.url },
      });

      this.logger.log(`Avatar uploaded successfully for member ${memberId}: ${blob.url}`);
    } catch (error) {
      this.logger.error(`Failed to upload avatar for member ${memberId}`, error);
      throw error;
    }
  }

  async handleReportGenerate() {
    this.logger.log('Generating family tree report...');

    try {
      const [totalMembers, maxGenMember, deceasedCount, birthMembers, latestProfile] =
        await Promise.all([
          this.prisma.member.count(),
          // members.generation là giá trị HIỆU LỰC (nhập tay ưu tiên, ngược lại
          // suy ra), nên đây mới là độ sâu thật của dòng họ. profiles.generation
          // gần như luôn null vì không ai nhập tay.
          this.prisma.member.aggregate({ _max: { generation: true } }),
          this.prisma.member.count({ where: { deathDate: { not: null } } }),
          this.prisma.member.findMany({
            where: { birthDate: { not: null } },
            select: { birthDate: true },
          }),
          this.prisma.profile.aggregate({ _max: { updated_at: true } }),
        ]);

      let born20th21st = 0;
      for (const m of birthMembers) {
        const year = new Date(m.birthDate as string).getFullYear();
        if (year >= 1901 && year <= 2100) born20th21st++;
      }

      const generations = maxGenMember._max.generation || 0;
      const lastUpdate = latestProfile._max.updated_at
        ? latestProfile._max.updated_at.toISOString().split('T')[0]
        : null;

      // Must match TreeService.computeStats() so cache hits carry every field
      // the dashboard reads.
      const report = {
        totalMembers,
        generations,
        totalGenerations: generations, // backward-compat alias
        deceased: deceasedCount,
        born20th21st,
        lastUpdate,
        generatedAt: new Date().toISOString(),
      };

      await this.redis.set('tree:stats', JSON.stringify(report), { ex: 3600 });
      this.logger.log(`Report generated and cached: ${totalMembers} members`);
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

  async handleNotification(data: { type: string; message: string; payload?: any }) {
    this.logger.log(`Notification event: [${data.type}] ${data.message}`);
    // Future: send email or push notification
  }

  /**
   * Nén ẢNH lossless (giữ nguyên kích thước & định dạng, không giảm chất lượng
   * nhìn thấy) bằng sharp. `.rotate()` áp EXIF orientation TRƯỚC khi sharp strip
   * metadata (mặc định) — nếu không ảnh chụp dọc sẽ bị xoay. Định dạng không nén
   * được (gif…) trả nguyên buffer.
   */
  private async compressImageLossless(buffer: Buffer, mimetype: string): Promise<Buffer> {
    const img = sharp(buffer).rotate();
    switch (mimetype) {
      case 'image/jpeg':
        // mozjpeg tối ưu bảng Huffman; quality 100 ≈ không mất chất lượng nhìn thấy.
        return img.jpeg({ mozjpeg: true, quality: 100 }).toBuffer();
      case 'image/png':
        return img.png({ compressionLevel: 9, effort: 10 }).toBuffer();
      case 'image/webp':
        return img.webp({ lossless: true, effort: 6 }).toBuffer();
      default:
        return buffer;
    }
  }

  /**
   * Xử lý mọi loại media off-request: ẢNH → nén lossless rồi lên Blob; video /
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
    this.logger.log(`Processing media ${mediaId} (${mimetype})`);

    const bufferObj =
      typeof buffer === 'string' ? Buffer.from(buffer, 'base64') : Buffer.from(buffer.data);

    await this.setMediaProgress(mediaId, { status: 'processing', progress: 10 });

    try {
      const outBuffer = mimetype.startsWith('image/')
        ? await this.compressImageLossless(bufferObj, mimetype)
        : bufferObj;

      await this.setMediaProgress(mediaId, { status: 'processing', progress: 50 });

      const blob = await put(`media/${mediaId}/${filename}`, outBuffer, {
        access: 'public',
        contentType: mimetype,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      await this.setMediaProgress(mediaId, { status: 'processing', progress: 90 });

      await this.prisma.media.update({
        where: { id: mediaId },
        data: { file_path: blob.url, size_bytes: outBuffer.length, status: 'ready' },
      });

      await this.setMediaProgress(mediaId, { status: 'ready', progress: 100 });
      this.logger.log(`Media ${mediaId} processed and uploaded: ${blob.url}`);
    } catch (error) {
      this.logger.error(`Failed to process media ${mediaId}`, error);
      // Đánh dấu failed để record không kẹt ở pending; nuốt lỗi update để không
      // che mất lỗi gốc.
      await this.prisma.media
        .update({ where: { id: mediaId }, data: { status: 'failed' } })
        .catch(() => {});
      await this.setMediaProgress(mediaId, {
        status: 'failed',
        progress: 100,
        error: (error as Error).message,
      });
      throw error;
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

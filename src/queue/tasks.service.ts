import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { put } from '@vercel/blob';
import { Redis as UpstashRedis } from '@upstash/redis';
import { GenerationService } from '../generation/generation.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: UpstashRedis,
    private readonly generationService: GenerationService,
  ) {}

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

  async handleImageProcess(data: { mediaId: string; buffer: { type: string; data: number[] } | string; filename: string; mimetype: string }) {
    const { mediaId, buffer, filename, mimetype } = data;
    this.logger.log(`Processing image for media ${mediaId}`);
    
    const bufferObj = typeof buffer === 'string' 
      ? Buffer.from(buffer, 'base64') 
      : Buffer.from(buffer.data);

    // Simplification for now: just upload to blob
    try {
      const blob = await put(`media/${mediaId}/${filename}`, bufferObj, {
        access: 'public',
        contentType: mimetype,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      await this.prisma.media.update({
        where: { id: mediaId },
        data: { file_path: blob.url },
      });

      this.logger.log(`Image processed and uploaded: ${blob.url}`);
    } catch (error) {
      this.logger.error(`Failed to process image for media ${mediaId}`, error);
      throw error;
    }
  }
}

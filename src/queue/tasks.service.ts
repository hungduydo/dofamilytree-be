import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { put } from '@vercel/blob';
import { Redis as UpstashRedis } from '@upstash/redis';
import { removeVietnameseTones } from '../utils/vietnamese-helper';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: UpstashRedis,
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
      const [totalMembers, maxGenProfile, deceasedCount] = await Promise.all([
        this.prisma.member.count(),
        this.prisma.profile.aggregate({ _max: { generation: true } }),
        this.prisma.member.count({ where: { deathDate: { not: null } } }),
      ]);

      const report = {
        totalMembers,
        totalGenerations: maxGenProfile._max.generation || 0,
        deceased: deceasedCount,
        generatedAt: new Date().toISOString(),
      };

      await this.redis.set('tree:stats', JSON.stringify(report), { ex: 3600 });
      this.logger.log(`Report generated and cached: ${totalMembers} members`);
    } catch (error) {
      this.logger.error('Failed to generate report', error);
      throw error;
    }
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

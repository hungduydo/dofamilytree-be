import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { put } from '@vercel/blob';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_AVATAR_UPLOAD } from '../queue.constants';

export interface AvatarUploadJobData {
  memberId: string;
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

@Processor(QUEUE_AVATAR_UPLOAD)
export class AvatarUploadProcessor {
  private readonly logger = new Logger(AvatarUploadProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process()
  async handleAvatarUpload(job: Job<AvatarUploadJobData>) {
    const { memberId, buffer, filename, mimetype } = job.data;
    this.logger.log(`Processing avatar upload for member ${memberId}`);

    try {
      const blob = await put(`avatars/${memberId}/${filename}`, Buffer.from(buffer), {
        access: 'public',
        contentType: mimetype,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      await this.prisma.member.update({
        where: { id: memberId },
        data: { avatar_url: blob.url },
      });

      this.logger.log(`Avatar uploaded successfully for member ${memberId}: ${blob.url}`);
      return { url: blob.url };
    } catch (error) {
      this.logger.error(`Failed to upload avatar for member ${memberId}`, error);
      throw error;
    }
  }
}

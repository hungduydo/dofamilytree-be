import { Injectable, NotFoundException } from '@nestjs/common';
import { QStashService } from '../queue/qstash.service';
import { del } from '@vercel/blob';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_IMAGE_PROCESS } from '../queue/queue.constants';

export interface ImageProcessJobData {
  mediaId: string;
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qstashService: QStashService,
  ) {}

  async uploadMedia(file: Express.Multer.File, uploaderId: string) {
    // Create a pending media record
    const media = await this.prisma.media.create({
      data: {
        file_path: `/pending/${Date.now()}_${file.originalname}`,
        uploader_id: uploaderId,
      },
    });

    // Queue image processing (compress + upload to Vercel Blob)
    await this.qstashService.publish(QUEUE_IMAGE_PROCESS, {
      mediaId: media.id,
      buffer: file.buffer.toString('base64'),
      filename: file.originalname,
      mimetype: file.mimetype,
    });

    return media;
  }

  async getMedia(filter: { uploader_id?: string }) {
    return this.prisma.media.findMany({
      where: filter.uploader_id ? { uploader_id: filter.uploader_id } : {},
      orderBy: { created_at: 'desc' },
    });
  }

  async deleteMedia(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException(`Media ${id} not found`);

    // Delete from Vercel Blob if it's a blob URL
    if (media.file_path.startsWith('https://')) {
      await del(media.file_path, { token: process.env.BLOB_READ_WRITE_TOKEN });
    }

    return this.prisma.media.delete({ where: { id } });
  }
}

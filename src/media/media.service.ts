import { Injectable, NotFoundException } from '@nestjs/common';
import { QStashService } from '../queue/qstash.service';
import { runInBackground } from '../utils/run-in-background';
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

  async uploadMedia(
    file: Express.Multer.File,
    uploaderId: string,
    meta: {
      title?: string;
      type?: string;
      member_id?: string;
      album_id?: string;
      uploader_name?: string;
    } = {},
  ) {
    // Create a pending media record
    const media = await this.prisma.media.create({
      data: {
        file_path: `/pending/${Date.now()}_${file.originalname}`,
        uploader_id: uploaderId,
        title: meta.title ?? file.originalname,
        type: meta.type,
        member_id: meta.member_id,
        album_id: meta.album_id,
        uploader_name: meta.uploader_name,
        size_bytes: file.size ?? null,
      },
    });

    // Queue image processing (compress + upload to Vercel Blob) off the request
    // path so the response returns the pending record immediately.
    runInBackground(
      this.qstashService.publish(QUEUE_IMAGE_PROCESS, {
        mediaId: media.id,
        buffer: file.buffer.toString('base64'),
        filename: file.originalname,
        mimetype: file.mimetype,
      }),
    );

    return media;
  }

  async getMedia(filter: { uploader_id?: string; member_id?: string; type?: string; album_id?: string }) {
    const where: any = {};
    if (filter.uploader_id) where.uploader_id = filter.uploader_id;
    if (filter.member_id) where.member_id = filter.member_id;
    if (filter.type) where.type = filter.type;
    if (filter.album_id) where.album_id = filter.album_id;
    return this.prisma.media.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── Albums ─────────────────────────────────────────────────────────────────

  /** Albums with their media count, for the /library album grid. */
  async getAlbums() {
    const albums = await this.prisma.mediaAlbum.findMany({
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { media: true } } },
    });
    return albums.map(({ _count, ...a }) => ({ ...a, count: _count.media }));
  }

  async createAlbum(data: { name: string; description?: string; cover_url?: string; date?: string }) {
    return this.prisma.mediaAlbum.create({ data });
  }

  async deleteAlbum(id: string) {
    // Detach media from the album, then delete it.
    await this.prisma.media.updateMany({ where: { album_id: id }, data: { album_id: null } });
    return this.prisma.mediaAlbum.delete({ where: { id } });
  }

  /** Documents/photos attached to a specific member ("Tài liệu liên quan"). */
  async getMemberMedia(memberId: string) {
    return this.prisma.media.findMany({
      where: { member_id: memberId },
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

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_IMAGE_PROCESS } from '../queue.constants';
import { ImageProcessJobData } from '../../media/media.service';

@Processor(QUEUE_IMAGE_PROCESS)
export class ImageProcessProcessor {
  private readonly logger = new Logger(ImageProcessProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process()
  async handleImageProcess(job: Job<ImageProcessJobData>) {
    const { mediaId, buffer, filename, mimetype } = job.data;
    this.logger.log(`Processing image for media ${mediaId}`);

    try {
      const imageBuffer = Buffer.from(buffer);

      // Generate thumbnail (300px wide) and full size (1200px wide)
      const [thumbnail, fullSize] = await Promise.all([
        sharp(imageBuffer).resize(300).toBuffer(),
        sharp(imageBuffer).resize(1200, undefined, { withoutEnlargement: true }).toBuffer(),
      ]);

      const ext = filename.split('.').pop() || 'jpg';
      const baseName = `media/${mediaId}`;

      const [thumbBlob, fullBlob] = await Promise.all([
        put(`${baseName}_thumb.${ext}`, thumbnail, {
          access: 'public',
          contentType: mimetype,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        }),
        put(`${baseName}_full.${ext}`, fullSize, {
          access: 'public',
          contentType: mimetype,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        }),
      ]);

      // Update media record with the full URL
      await this.prisma.media.update({
        where: { id: mediaId },
        data: { file_path: fullBlob.url },
      });

      this.logger.log(`Image processed: ${fullBlob.url} (thumb: ${thumbBlob.url})`);
      return { full: fullBlob.url, thumb: thumbBlob.url };
    } catch (error) {
      this.logger.error(`Failed to process image for media ${mediaId}`, error);
      throw error;
    }
  }
}

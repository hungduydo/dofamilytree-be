import { Injectable } from '@nestjs/common';
import { put, del, list } from '@vercel/blob';
import { StorageProvider, StorageUsage } from './storage.interface';

/** Host chung của mọi URL Vercel Blob public — dùng để nhận diện ownership. */
const VERCEL_BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

@Injectable()
export class VercelBlobProvider implements StorageProvider {
  readonly name = 'vercel-blob';

  isConfigured(): boolean {
    return !!process.env.BLOB_READ_WRITE_TOKEN;
  }

  async put(path: string, buffer: Buffer, contentType: string): Promise<string> {
    const blob = await put(path, buffer, {
      access: 'public',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  }

  async del(url: string): Promise<void> {
    await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
  }

  ownsUrl(url: string): boolean {
    try {
      return new URL(url).host.endsWith(VERCEL_BLOB_HOST_SUFFIX);
    } catch {
      return false;
    }
  }

  /**
   * Vercel Blob không cấp presigned PUT kiểu S3 — client upload qua
   * `handleUpload` + client token, một luồng khác hẳn. Trả false để media
   * service fallback về multipart thay vì cấp URL hỏng.
   */
  supportsPresign(): boolean {
    return false;
  }

  /** Quét trực tiếp qua API `list` — không cache, dùng cho endpoint đối chiếu dung lượng. */
  async getUsage(): Promise<StorageUsage> {
    let cursor: string | undefined;
    let totalBytes = 0;
    let totalFiles = 0;

    do {
      const response = await list({ cursor, limit: 1000, token: process.env.BLOB_READ_WRITE_TOKEN });
      for (const blob of response.blobs) totalBytes += blob.size;
      totalFiles += response.blobs.length;
      cursor = response.cursor;
    } while (cursor);

    return { totalBytes, totalFiles };
  }
}

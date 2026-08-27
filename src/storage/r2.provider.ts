import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider, StorageUsage } from './storage.interface';

/**
 * Cloudflare R2 — tương thích S3 API. Bucket phải bật public access (custom
 * domain hoặc *.r2.dev) và `R2_PUBLIC_URL` phải trỏ đúng gốc đó, vì R2 không
 * có API trả sẵn public URL như Vercel Blob — ta tự ghép `${R2_PUBLIC_URL}/${path}`.
 */
@Injectable()
export class R2Provider implements StorageProvider {
  readonly name = 'r2';

  private readonly accountId = process.env.R2_ACCOUNT_ID ?? '';
  private readonly bucket = process.env.R2_BUCKET_NAME ?? '';
  private readonly accessKeyId = process.env.R2_ACCESS_KEY_ID ?? '';
  private readonly secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? '';
  private readonly publicUrl = (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');

  private client: S3Client | null = null;

  isConfigured(): boolean {
    return !!(this.accountId && this.bucket && this.accessKeyId && this.secretAccessKey && this.publicUrl);
  }

  /** Lazy — tránh dựng S3Client (và validate creds) ở project không dùng R2. */
  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: this.accessKeyId, secretAccessKey: this.secretAccessKey },
      });
    }
    return this.client;
  }

  async put(path: string, buffer: Buffer, contentType: string): Promise<string> {
    await this.getClient().send(
      new PutObjectCommand({ Bucket: this.bucket, Key: path, Body: buffer, ContentType: contentType }),
    );
    return `${this.publicUrl}/${path}`;
  }

  async del(url: string): Promise<void> {
    const key = url.slice(this.publicUrl.length + 1);
    await this.getClient().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  ownsUrl(url: string): boolean {
    return this.publicUrl.length > 0 && url.startsWith(`${this.publicUrl}/`);
  }

  /** R2 tương thích S3 nên ký được presigned PUT bằng chính credentials sẵn có. */
  supportsPresign(): boolean {
    return this.isConfigured();
  }

  /**
   * `ContentType` được đưa vào command nên nó nằm trong chữ ký — client PUT
   * bằng header khác sẽ bị R2 từ chối. Điều này là CỐ Ý: nếu không ký, client
   * upload được file bất kỳ dưới danh nghĩa mime đã duyệt ở bước xin URL.
   */
  presignPut(path: string, contentType: string, expiresIn: number): Promise<string> {
    return getSignedUrl(
      this.getClient(),
      new PutObjectCommand({ Bucket: this.bucket, Key: path, ContentType: contentType }),
      { expiresIn },
    );
  }

  publicUrlFor(path: string): string {
    return `${this.publicUrl}/${path}`;
  }

  async headSize(path: string): Promise<number | null> {
    try {
      const res = await this.getClient().send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: path }),
      );
      return res.ContentLength ?? null;
    } catch (error) {
      // 404/NotFound = client chưa PUT xong. Mọi lỗi khác (creds sai, bucket
      // sai) cũng rơi vào đây — ném tiếp để không báo nhầm là "chưa upload".
      const name = (error as { name?: string }).name;
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) return null;
      throw error;
    }
  }

  async getUsage(): Promise<StorageUsage> {
    let continuationToken: string | undefined;
    let totalBytes = 0;
    let totalFiles = 0;

    do {
      const response = await this.getClient().send(
        new ListObjectsV2Command({ Bucket: this.bucket, ContinuationToken: continuationToken }),
      );
      for (const obj of response.Contents ?? []) totalBytes += obj.Size ?? 0;
      totalFiles += response.Contents?.length ?? 0;
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return { totalBytes, totalFiles };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { StorageProvider, StorageUsage } from './storage.interface';
import { VercelBlobProvider } from './vercel-blob.provider';
import { R2Provider } from './r2.provider';
import { errorAttributes, logEvent } from '../observability/log-event';

/**
 * Facade chọn provider lưu trữ ACTIVE theo `STORAGE_PROVIDER` (`vercel-blob` |
 * `r2`, mặc định `vercel-blob`) — mọi upload MỚI đi qua provider này. `del`
 * route theo `ownsUrl` thay vì theo provider active: đổi `STORAGE_PROVIDER`
 * không được làm mất khả năng xoá file cũ đang nằm ở provider trước đó.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly providers: StorageProvider[];
  private readonly active: StorageProvider;

  constructor(vercelBlob: VercelBlobProvider, r2: R2Provider) {
    this.providers = [vercelBlob, r2];

    const requested = process.env.STORAGE_PROVIDER;
    const candidate = this.providers.find((p) => p.name === requested);
    let fallbackReason: string | undefined;
    if (requested && !candidate) {
      this.logger.warn(`STORAGE_PROVIDER="${requested}" không hợp lệ, dùng vercel-blob`);
      fallbackReason = 'unknown_provider';
    } else if (candidate && !candidate.isConfigured()) {
      this.logger.warn(`STORAGE_PROVIDER="${requested}" thiếu credentials, fallback vercel-blob`);
      fallbackReason = 'missing_credentials';
    }

    this.active = candidate?.isConfigured() ? candidate : vercelBlob;
    if (fallbackReason) {
      // File mới đang rơi sai chỗ — chạy được nhưng sai cấu hình.
      logEvent('storage.provider.fallback', 'warn', 'Storage provider fell back to default', {
        'storage.requested': requested,
        'storage.active': this.active.name,
        'storage.reason': fallbackReason,
      });
    }
    this.logger.log(`Active storage provider: ${this.active.name}`);
  }

  put(path: string, buffer: Buffer, contentType: string): Promise<string> {
    return this.active.put(path, buffer, contentType);
  }

  /** Provider ACTIVE có cấp được presigned PUT không — quyết định luồng upload file lớn. */
  supportsPresign(): boolean {
    return this.active.supportsPresign();
  }

  presignPut(path: string, contentType: string, expiresIn: number): Promise<string> {
    if (!this.active.presignPut) {
      throw new Error(`Provider "${this.active.name}" không hỗ trợ presigned upload`);
    }
    return this.active.presignPut(path, contentType, expiresIn);
  }

  publicUrlFor(path: string): string {
    if (!this.active.publicUrlFor) {
      throw new Error(`Provider "${this.active.name}" không suy được public URL trước khi upload`);
    }
    return this.active.publicUrlFor(path);
  }

  /** `null` = object chưa tồn tại trên storage (client chưa PUT xong). */
  headSize(path: string): Promise<number | null> {
    if (!this.active.headSize) {
      throw new Error(`Provider "${this.active.name}" không kiểm tra được object`);
    }
    return this.active.headSize(path);
  }

  async del(url: string): Promise<void> {
    const owner = this.providers.find((p) => p.ownsUrl(url));
    if (!owner) {
      this.logger.warn(`Không provider nào nhận URL này, bỏ qua xoá: ${url}`);
      // Không ghi URL: path chứa tên tệp người dùng đặt.
      logEvent('storage.delete.failed', 'warn', 'Storage delete skipped: no provider owns URL', {
        'storage.reason': 'unknown_provider',
      });
      return;
    }
    try {
      await owner.del(url);
    } catch (err) {
      // Chỗ gọi thường nuốt lỗi (dọn best-effort) ⇒ file mồ côi tính tiền mãi.
      logEvent('storage.delete.failed', 'warn', 'Storage delete failed', {
        'storage.provider': owner.name,
        'storage.reason': 'provider_error',
        ...errorAttributes(err),
      });
      throw err;
    }
  }

  /** Cộng dồn usage của mọi provider ĐÃ CẤU HÌNH — hữu ích khi file nằm rải rác 2 nơi. */
  async getUsage(): Promise<StorageUsage> {
    const configured = this.providers.filter((p) => p.isConfigured());
    const usages = await Promise.all(configured.map((p) => p.getUsage()));
    return usages.reduce(
      (acc, u) => ({ totalBytes: acc.totalBytes + u.totalBytes, totalFiles: acc.totalFiles + u.totalFiles }),
      { totalBytes: 0, totalFiles: 0 },
    );
  }
}

import { Logger } from '@nestjs/common';
import type { Redis as UpstashRedis } from '@upstash/redis';

/**
 * Bọc Redis theo kiểu best-effort. Cache là tối ưu hoá, KHÔNG BAO GIỜ là hard
 * dependency: Upstash chết (mất mạng, instance free-tier bị pause, thiếu creds)
 * thì đọc/ghi degrade thành no-op và đường DB vẫn phục vụ request thay vì 500.
 *
 * Tách từ TreeService — TreeService và MembersService dùng chung đúng ba hàm này.
 * Giữ nguyên chữ ký gọi Redis (`get(key)`, `set(key, JSON.stringify(v), { ex })`,
 * `del(...keys)`) để không đổi hành vi khi migrate.
 */
export class SafeCache {
  constructor(
    private readonly redis: UpstashRedis,
    private readonly logger: Logger,
    private readonly defaultTtl: number,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const v = await this.redis.get<any>(key);
      if (v == null) return null;
      // Upstash tự deserialize JSON, nhưng không phải lúc nào cũng vậy.
      return (typeof v === 'string' ? JSON.parse(v) : v) as T;
    } catch (err) {
      this.logger.warn(`Redis GET ${key} failed, falling back to DB: ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttl = this.defaultTtl): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), { ex: ttl });
    } catch (err) {
      this.logger.warn(`Redis SET ${key} failed (non-fatal): ${(err as Error).message}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (err) {
      this.logger.warn(`Redis DEL ${keys.join(',')} failed (non-fatal): ${(err as Error).message}`);
    }
  }
}

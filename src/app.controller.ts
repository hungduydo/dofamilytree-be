import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Redis as UpstashRedis } from '@upstash/redis';

/** Kết quả probe cache trả kèm trong `/status`. */
interface CacheHealth {
  /** `ok` = PING thành công; `unreachable` = Redis chết/pause/sai creds. */
  status: 'ok' | 'unreachable';
  latencyMs: number;
  /** Chỉ có khi `unreachable` — lý do để debug ngay trên response. */
  error?: string;
}

@ApiTags('System')
@Controller()
export class AppController {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: UpstashRedis) {}

  /**
   * PING Redis để lộ ra tình trạng cache. Có endpoint này vì SafeCache cố ý
   * degrade âm thầm: khi instance Upstash bị xoá, mọi response vẫn trả 200 và
   * chỉ có `logger.warn` báo — nên API đã chạy KHÔNG cache một thời gian dài mà
   * không ai biết, mỗi request phải xuống thẳng Postgres.
   *
   * KHÔNG ném lỗi khi Redis chết: cache là tối ưu hoá, không phải hard
   * dependency, nên `/status` vẫn 200 và chỉ đánh dấu `degraded`. Việc phát
   * hiện là của monitoring/uptime check chứ không phải của HTTP status code.
   */
  private async checkCache(): Promise<CacheHealth> {
    const startedAt = Date.now();
    try {
      await this.redis.ping();
      return { status: 'ok', latencyMs: Date.now() - startedAt };
    } catch (err) {
      return {
        status: 'unreachable',
        latencyMs: Date.now() - startedAt,
        error: (err as Error).message,
      };
    }
  }

  @Get('status')
  @ApiOperation({ summary: 'Check API status (kèm health của Redis cache)' })
  async getStatus() {
    const cache = await this.checkCache();

    return {
      // `degraded` = API sống nhưng đang chạy không cache ⇒ mọi read xuống DB.
      status: cache.status === 'ok' ? 'ok' : 'degraded',
      name: 'Family Tree API v2',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      cache,
    };
  }

  @Get()
  @ApiOperation({ summary: 'API Root' })
  getRoot() {
    return {
      message: 'Family Tree API v2 is running',
      docs: '/docs',
      status: '/v2/status',
    };
  }
}

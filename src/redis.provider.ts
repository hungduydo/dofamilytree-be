import { Provider } from '@nestjs/common';
import { Redis as UpstashRedis } from '@upstash/redis';

export const redisProvider: Provider = {
  provide: 'REDIS_CLIENT',
  useFactory: () => {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error('UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not defined');
    }

    return new UpstashRedis({
      url,
      token,
      // The cache is an optimization, never a hard dependency. Disable the
      // default retry (5 attempts w/ exponential backoff ≈ 4.3s stall when the
      // instance is unreachable) so a dead/paused Redis fails in ~10ms and the
      // callers' DB fallback (TreeService.safeCache*) serves the request within
      // budget. `signal` (fresh per request) also bounds a slow-but-alive Redis.
      retry: false,
      signal: () => AbortSignal.timeout(300),
    });
  },
};

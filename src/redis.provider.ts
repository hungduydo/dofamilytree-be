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
    });
  },
};

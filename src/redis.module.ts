import { Global, Module } from '@nestjs/common';
import { durableRedisProvider, redisProvider } from './redis.provider';

@Global()
@Module({
  providers: [redisProvider, durableRedisProvider],
  exports: [redisProvider, durableRedisProvider],
})
export class RedisModule {}

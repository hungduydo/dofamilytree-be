import { Module } from '@nestjs/common';
import { TreeController } from './tree.controller';
import { TreeService } from './tree.service';
import { redisProvider } from '../redis.provider';

@Module({
  controllers: [TreeController],
  providers: [TreeService, redisProvider],
  exports: [TreeService],
})
export class TreeModule {}

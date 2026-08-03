import { Module } from '@nestjs/common';
import { LifeEventsController } from './life-events.controller';
import { LifeEventsService } from './life-events.service';

@Module({
  controllers: [LifeEventsController],
  providers: [LifeEventsService],
  exports: [LifeEventsService],
})
export class LifeEventsModule {}

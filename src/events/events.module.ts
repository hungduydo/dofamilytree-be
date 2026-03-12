import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { EventsController } from './events.controller';
import { AnniversariesController } from './anniversaries.controller';
import { EventsService } from './events.service';
import { QUEUE_NOTIFICATION } from '../queue/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NOTIFICATION })],
  controllers: [EventsController, AnniversariesController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}

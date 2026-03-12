import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { AnniversariesController } from './anniversaries.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController, AnniversariesController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}

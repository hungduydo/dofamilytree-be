import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { RelationshipsController } from './relationships.controller';
import { RelationshipsService } from './relationships.service';
import { QUEUE_NOTIFICATION } from '../queue/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NOTIFICATION })],
  controllers: [RelationshipsController],
  providers: [RelationshipsService],
  exports: [RelationshipsService],
})
export class RelationshipsModule {}

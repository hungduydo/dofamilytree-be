import { Module, Global } from '@nestjs/common';
import { QStashService } from './qstash.service';
import { TasksService } from './tasks.service';
import { QueueController } from './queue.controller';

@Global()
@Module({
  providers: [QStashService, TasksService],
  controllers: [QueueController],
  exports: [QStashService, TasksService],
})
export class QueueModule {}

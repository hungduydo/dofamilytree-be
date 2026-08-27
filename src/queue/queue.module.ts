import { Module, Global } from '@nestjs/common';
import { QStashService } from './qstash.service';
import { TasksService } from './tasks.service';
import { QueueController } from './queue.controller';
import { QStashSignatureGuard } from './qstash-signature.guard';

@Global()
@Module({
  providers: [QStashService, TasksService, QStashSignatureGuard],
  controllers: [QueueController],
  exports: [QStashService, TasksService],
})
export class QueueModule {}

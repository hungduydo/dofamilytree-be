import { Module, Global } from '@nestjs/common';
import { QStashService } from './qstash.service';
import { TasksService } from './tasks.service';
import { QueueController } from './queue.controller';
import { QStashSignatureGuard } from './qstash-signature.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Global()
@Module({
  imports: [NotificationsModule],
  providers: [QStashService, TasksService, QStashSignatureGuard],
  controllers: [QueueController],
  exports: [QStashService, TasksService],
})
export class QueueModule {}

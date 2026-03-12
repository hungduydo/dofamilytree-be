import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AvatarUploadProcessor } from './processors/avatar-upload.processor';
import { ReportGenerateProcessor } from './processors/report-generate.processor';
import { NotificationProcessor } from './processors/notification.processor';
import {
  QUEUE_AVATAR_UPLOAD,
  QUEUE_REPORT_GENERATE,
  QUEUE_NOTIFICATION,
  QUEUE_IMAGE_PROCESS,
} from './queue.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_AVATAR_UPLOAD },
      { name: QUEUE_REPORT_GENERATE },
      { name: QUEUE_NOTIFICATION },
      { name: QUEUE_IMAGE_PROCESS },
    ),
  ],
  providers: [AvatarUploadProcessor, ReportGenerateProcessor, NotificationProcessor],
  exports: [BullModule],
})
export class QueueModule {}

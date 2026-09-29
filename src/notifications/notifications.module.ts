import { Module } from '@nestjs/common';
import { AnniversaryReminderService } from './anniversary-reminder.service';
import { NotificationsController } from './notifications.controller';

@Module({
  controllers: [NotificationsController],
  providers: [AnniversaryReminderService],
  exports: [AnniversaryReminderService],
})
export class NotificationsModule {}

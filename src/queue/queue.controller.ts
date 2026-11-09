import { Controller, Post, Body, Param, Logger, UseGuards } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { logEvent } from '../observability/log-event';
import { Public } from '../auth/public.decorator';
import { QStashSignatureGuard } from './qstash-signature.guard';
import { TasksService } from './tasks.service';
import { QUEUE_AVATAR_UPLOAD, QUEUE_REPORT_GENERATE, QUEUE_NOTIFICATION, QUEUE_IMAGE_PROCESS, QUEUE_GENERATION_RECOMPUTE, QUEUE_ACCOUNT_PENDING, QUEUE_ANNIVERSARY_REMINDER, QUEUE_DRIVE_IMPORT } from './queue.constants';
import { AnniversaryReminderService } from '../notifications/anniversary-reminder.service';

@Controller('queue')
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly anniversaryReminders: AnniversaryReminderService,
  ) {}

  // KHÔNG dùng JWT: người gọi là QStash chứ không phải người dùng. Danh tính
  // được chứng minh bằng chữ ký (QStashSignatureGuard), không phải bằng token.
  @Public()
  @UseGuards(QStashSignatureGuard)
  @Post('callback/:task')
  async handleCallback(@Param('task') task: string, @Body() data: any) {
    this.logger.log(`Received QStash callback for task: ${task}`);

    switch (task) {
      case QUEUE_AVATAR_UPLOAD:
        await this.tasksService.handleAvatarUpload(data);
        break;
      case QUEUE_REPORT_GENERATE:
        await this.tasksService.handleReportGenerate();
        break;
      case QUEUE_NOTIFICATION:
        await this.tasksService.handleNotification(data);
        break;
      case QUEUE_IMAGE_PROCESS:
        await this.tasksService.handleImageProcess(data);
        break;
      case QUEUE_GENERATION_RECOMPUTE:
        await this.tasksService.handleGenerationRecompute();
        break;
      case QUEUE_ACCOUNT_PENDING:
        await this.tasksService.handleAccountPending(data);
        break;
      case QUEUE_DRIVE_IMPORT:
        await this.tasksService.handleDriveImport(data);
        break;
      case QUEUE_ANNIVERSARY_REMINDER:
        await this.anniversaryReminders.sendDailyReminders();
        break;
      default:
        this.logger.warn(`Unknown task received: ${task}`);
        // Request đã qua kiểm chữ ký nên đây là lệch phiên bản publisher/consumer
        // (vd. schedule QStash cũ), không phải tấn công — warn, kèm tên task.
        logEvent('queue.task.unknown', 'warn', Sentry.logger.fmt`Unknown QStash task ${task}`, {
          'messaging.system': 'qstash',
          'messaging.destination.name': task,
        });
    }

    return { success: true };
  }
}

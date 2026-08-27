import { Controller, Post, Body, Param, Logger, UseGuards } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { QStashSignatureGuard } from './qstash-signature.guard';
import { TasksService } from './tasks.service';
import { QUEUE_AVATAR_UPLOAD, QUEUE_REPORT_GENERATE, QUEUE_NOTIFICATION, QUEUE_IMAGE_PROCESS, QUEUE_GENERATION_RECOMPUTE } from './queue.constants';

@Controller('queue')
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

  constructor(private readonly tasksService: TasksService) {}

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
      default:
        this.logger.warn(`Unknown task received: ${task}`);
    }

    return { success: true };
  }
}

import { Controller, Post, Body, Param, Logger, UnauthorizedException, Req } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { QUEUE_AVATAR_UPLOAD, QUEUE_REPORT_GENERATE, QUEUE_NOTIFICATION, QUEUE_IMAGE_PROCESS } from './queue.constants';

@Controller('queue')
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

  constructor(private readonly tasksService: TasksService) {}

  @Post('callback/:task')
  async handleCallback(
    @Param('task') task: string,
    @Body() data: any,
    @Req() req: any
  ) {
    this.logger.log(`Received QStash callback for task: ${task}`);

    // Verification logic (optional but recommended)
    // if (process.env.NODE_ENV === 'production') {
    //   // Verify QStash signature here
    // }

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
      default:
        this.logger.warn(`Unknown task received: ${task}`);
    }

    return { success: true };
  }
}

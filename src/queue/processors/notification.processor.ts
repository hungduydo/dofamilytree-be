import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NOTIFICATION } from '../queue.constants';

export type NotificationType = 'NEW_MEMBER' | 'NEW_RELATIONSHIP' | 'NEW_EVENT';

export interface NotificationJobData {
  type: NotificationType;
  payload: Record<string, any>;
}

@Processor(QUEUE_NOTIFICATION)
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  @Process()
  async handleNotification(job: Job<NotificationJobData>) {
    const { type, payload } = job.data;
    this.logger.log(`[Notification] type=${type} payload=${JSON.stringify(payload)}`);

    // Phase 1: just log. Phase 2: send email/push via provider
    switch (type) {
      case 'NEW_MEMBER':
        this.logger.log(`New member added: ${payload.name}`);
        break;
      case 'NEW_RELATIONSHIP':
        this.logger.log(`New relationship: ${payload.parentId} → ${payload.childId} (${payload.type})`);
        break;
      case 'NEW_EVENT':
        this.logger.log(`New event: ${payload.title}`);
        break;
    }
  }
}

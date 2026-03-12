import { Job } from 'bull';
export type NotificationType = 'NEW_MEMBER' | 'NEW_RELATIONSHIP' | 'NEW_EVENT';
export interface NotificationJobData {
    type: NotificationType;
    payload: Record<string, any>;
}
export declare class NotificationProcessor {
    private readonly logger;
    handleNotification(job: Job<NotificationJobData>): Promise<void>;
}

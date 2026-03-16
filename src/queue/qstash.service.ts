import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@upstash/qstash';

@Injectable()
export class QStashService {
  private readonly logger = new Logger(QStashService.name);
  private client: Client;

  constructor() {
    this.client = new Client({
      token: process.env.QSTASH_TOKEN!,
    });
  }

  async publish(task: string, data: any) {
    let appUrl = process.env.APP_URL || 'http://localhost:3002';
    if (!/^https?:\/\//i.test(appUrl)) appUrl = `https://${appUrl}`;
    const callbackUrl = `${appUrl}/v2/queue/callback/${task}`;

    this.logger.log(`Publishing task ${task} to QStash callback: ${callbackUrl}`);

    try {
      await this.client.publishJSON({
        url: callbackUrl,
        body: data,
        // Optional: headers for security verification
        headers: {
          'x-qstash-signature': 'required',
        },
      });
    } catch (error) {
      this.logger.error(`Failed to publish task ${task} to QStash`, error);
      throw error;
    }
  }
}

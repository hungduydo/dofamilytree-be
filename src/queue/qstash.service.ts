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
    const appUrl = process.env.APP_URL || 'http://localhost:3002';
    const callbackUrl = `${appUrl}/queue/callback/${task}`;

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

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

  /**
   * @param opts.delay Seconds to wait before QStash delivers the callback.
   * @param opts.deduplicationId Collapses repeat publishes with the same id into
   *   a single delivery. Combined with `delay` this gives cheap debouncing —
   *   see `GenerationService.enqueueRecompute`.
   */
  async publish(task: string, data: any, opts?: { delay?: number; deduplicationId?: string }) {
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
        ...(opts?.delay !== undefined ? { delay: opts.delay } : {}),
        ...(opts?.deduplicationId ? { deduplicationId: opts.deduplicationId } : {}),
      });
    } catch (error) {
      this.logger.error(`Failed to publish task ${task} to QStash`, error);
      throw error;
    }
  }
}

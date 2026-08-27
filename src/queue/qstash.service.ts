import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@upstash/qstash';
import { queueCallbackUrl } from './queue.constants';

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
    const callbackUrl = queueCallbackUrl(task);

    this.logger.log(`Publishing task ${task} to QStash callback: ${callbackUrl}`);

    try {
      await this.client.publishJSON({
        url: callbackUrl,
        body: data,
        ...(opts?.delay !== undefined ? { delay: opts.delay } : {}),
        ...(opts?.deduplicationId ? { deduplicationId: opts.deduplicationId } : {}),
      });
    } catch (error) {
      this.logger.error(`Failed to publish task ${task} to QStash`, error);
      throw error;
    }
  }
}

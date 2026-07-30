import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'production' ? [] : ['warn', 'error'],
    });
  }

  // Establish the DB connection during module init instead of lazily on the
  // first query, so a serverless cold start doesn't add connect latency to the
  // first request that hits it.
  async onModuleInit() {
    await this.$connect();
  }
}

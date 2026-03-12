import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MembersModule } from './members/members.module';
import { RelationshipsModule } from './relationships/relationships.module';
import { TreeModule } from './tree/tree.module';
import { EventsModule } from './events/events.module';
import { MediaModule } from './media/media.module';
import { GravesModule } from './graves/graves.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      // Upstash uses rediss:// (TLS). Fallback to host/port for local dev.
      url: process.env.REDIS_URL || undefined,
      redis: process.env.REDIS_URL
        ? undefined
        : {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
          },
    }),
    PrismaModule,
    AuthModule,
    QueueModule,
    MembersModule,
    RelationshipsModule,
    TreeModule,
    EventsModule,
    MediaModule,
    GravesModule,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MembersModule } from './members/members.module';
import { RelationshipsModule } from './relationships/relationships.module';
import { TreeModule } from './tree/tree.module';
import { EventsModule } from './events/events.module';
import { MediaModule } from './media/media.module';
import { GravesModule } from './graves/graves.module';
import { LifeEventsModule } from './life-events/life-events.module';
import { MemoriesModule } from './memories/memories.module';
import { ArticlesModule } from './articles/articles.module';
import { QueueModule } from './queue/queue.module';
import { GenerationModule } from './generation/generation.module';
import { RedisModule } from './redis.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    StorageModule,
    PrismaModule,
    AuthModule,
    QueueModule,
    GenerationModule,
    MembersModule,
    RelationshipsModule,
    TreeModule,
    EventsModule,
    MediaModule,
    GravesModule,
    LifeEventsModule,
    MemoriesModule,
    ArticlesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

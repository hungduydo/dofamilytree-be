import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MembersModule } from './members/members.module';
import { RelationshipsModule } from './relationships/relationships.module';
import { TreeModule } from './tree/tree.module';
import { EventsModule } from './events/events.module';
import { MediaModule } from './media/media.module';
import { GravesModule } from './graves/graves.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
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

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { QUEUE_AVATAR_UPLOAD, QUEUE_REPORT_GENERATE, QUEUE_NOTIFICATION } from '../queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_AVATAR_UPLOAD },
      { name: QUEUE_REPORT_GENERATE },
      { name: QUEUE_NOTIFICATION },
    ),
  ],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}

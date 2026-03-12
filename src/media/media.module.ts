import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { ImageProcessProcessor } from '../queue/processors/image-process.processor';
import { QUEUE_IMAGE_PROCESS } from '../queue/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_IMAGE_PROCESS })],
  controllers: [MediaController],
  providers: [MediaService, ImageProcessProcessor],
  exports: [MediaService],
})
export class MediaModule {}

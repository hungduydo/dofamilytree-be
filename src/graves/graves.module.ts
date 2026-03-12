import { Module } from '@nestjs/common';
import { GravesController } from './graves.controller';
import { GravesService } from './graves.service';

@Module({
  controllers: [GravesController],
  providers: [GravesService],
  exports: [GravesService],
})
export class GravesModule {}

import { Module } from '@nestjs/common';
import { GraveAreasController } from './grave-areas.controller';
import { GraveAreasService } from './grave-areas.service';

@Module({
  controllers: [GraveAreasController],
  providers: [GraveAreasService],
})
export class GraveAreasModule {}

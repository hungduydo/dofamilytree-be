import { Module } from '@nestjs/common';
import { TreeController } from './tree.controller';
import { ReportController } from './report.controller';
import { TreeService } from './tree.service';

@Module({
  controllers: [TreeController, ReportController],
  providers: [TreeService],
  exports: [TreeService],
})
export class TreeModule {}

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_REPORT_GENERATE } from '../queue.constants';

@Processor(QUEUE_REPORT_GENERATE)
export class ReportGenerateProcessor {
  private readonly logger = new Logger(ReportGenerateProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process()
  async handleReportGenerate(job: Job) {
    this.logger.log('Generating family tree report...');

    try {
      const [totalMembers, maxGenProfile, deceasedCount] = await Promise.all([
        this.prisma.member.count(),
        this.prisma.profile.aggregate({ _max: { generation: true } }),
        this.prisma.member.count({ where: { deathDate: { not: null } } }),
      ]);

      const report = {
        totalMembers,
        totalGenerations: maxGenProfile._max.generation || 0,
        deceased: deceasedCount,
        generatedAt: new Date().toISOString(),
      };

      // In production: save to Redis
      // await redis.set('report:cached', JSON.stringify(report), 'EX', 3600);
      this.logger.log(`Report generated: ${totalMembers} members`);
      return report;
    } catch (error) {
      this.logger.error('Failed to generate report', error);
      throw error;
    }
  }
}

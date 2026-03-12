import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
export declare class ReportGenerateProcessor {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    handleReportGenerate(job: Job): Promise<{
        totalMembers: number;
        totalGenerations: number;
        deceased: number;
        generatedAt: string;
    }>;
}

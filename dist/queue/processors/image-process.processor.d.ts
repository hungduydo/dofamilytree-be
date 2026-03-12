import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { ImageProcessJobData } from '../../media/media.service';
export declare class ImageProcessProcessor {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    handleImageProcess(job: Job<ImageProcessJobData>): Promise<{
        full: string;
        thumb: string;
    }>;
}

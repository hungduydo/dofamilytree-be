import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
export interface AvatarUploadJobData {
    memberId: string;
    buffer: Buffer;
    filename: string;
    mimetype: string;
}
export declare class AvatarUploadProcessor {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    handleAvatarUpload(job: Job<AvatarUploadJobData>): Promise<{
        url: string;
    }>;
}

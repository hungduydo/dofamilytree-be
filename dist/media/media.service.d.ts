import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
export interface ImageProcessJobData {
    mediaId: string;
    buffer: Buffer;
    filename: string;
    mimetype: string;
}
export declare class MediaService {
    private readonly prisma;
    private imageProcessQueue;
    constructor(prisma: PrismaService, imageProcessQueue: Queue);
    uploadMedia(file: Express.Multer.File, uploaderId: string): Promise<{
        id: string;
        created_at: Date;
        file_path: string;
        uploader_id: string;
    }>;
    getMedia(filter: {
        uploader_id?: string;
    }): Promise<{
        id: string;
        created_at: Date;
        file_path: string;
        uploader_id: string;
    }[]>;
    deleteMedia(id: string): Promise<{
        id: string;
        created_at: Date;
        file_path: string;
        uploader_id: string;
    }>;
}

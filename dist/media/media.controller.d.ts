/// <reference types="multer" />
import { MediaService } from './media.service';
export declare class MediaController {
    private readonly mediaService;
    constructor(mediaService: MediaService);
    uploadMedia(file: Express.Multer.File, req: any): Promise<{
        id: string;
        created_at: Date;
        file_path: string;
        uploader_id: string;
    }>;
    getMedia(uploader_id?: string): Promise<{
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

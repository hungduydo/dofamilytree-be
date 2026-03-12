import { PrismaService } from '../prisma/prisma.service';
import { CreateGraveDto, UpdateGraveDto } from './dto/create-grave.dto';
export declare class GravesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getAllGraves(filter: {
        name?: string;
    }): Promise<{
        name: string;
        description: string | null;
        id: string;
        created_at: Date;
        updated_at: Date;
        latitude: number;
        longitude: number;
    }[]>;
    getGraveById(id: string): Promise<{
        name: string;
        description: string | null;
        id: string;
        created_at: Date;
        updated_at: Date;
        latitude: number;
        longitude: number;
    }>;
    getNearbyGraves(params: {
        lat: number;
        lng: number;
        radiusKm?: number;
    }): Promise<{
        name: string;
        description: string | null;
        id: string;
        created_at: Date;
        updated_at: Date;
        latitude: number;
        longitude: number;
    }[]>;
    createGrave(dto: CreateGraveDto): Promise<{
        name: string;
        description: string | null;
        id: string;
        created_at: Date;
        updated_at: Date;
        latitude: number;
        longitude: number;
    }>;
    updateGrave(id: string, dto: UpdateGraveDto): Promise<{
        name: string;
        description: string | null;
        id: string;
        created_at: Date;
        updated_at: Date;
        latitude: number;
        longitude: number;
    }>;
    deleteGrave(id: string): Promise<{
        name: string;
        description: string | null;
        id: string;
        created_at: Date;
        updated_at: Date;
        latitude: number;
        longitude: number;
    }>;
}

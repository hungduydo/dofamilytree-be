import { GravesService } from './graves.service';
import { CreateGraveDto, UpdateGraveDto } from './dto/create-grave.dto';
export declare class GravesController {
    private readonly gravesService;
    constructor(gravesService: GravesService);
    getAllGraves(name?: string): Promise<{
        name: string;
        description: string | null;
        id: string;
        created_at: Date;
        updated_at: Date;
        latitude: number;
        longitude: number;
    }[]>;
    getNearbyGraves(lat: string, lng: string, radiusKm?: string): Promise<{
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

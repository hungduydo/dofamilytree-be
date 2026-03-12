export declare class CreateGraveDto {
    name: string;
    latitude: number;
    longitude: number;
    description?: string;
}
export declare class UpdateGraveDto {
    name?: string;
    latitude?: number;
    longitude?: number;
    description?: string;
}
export declare class NearbyGraveQueryDto {
    lat: number;
    lng: number;
    radiusKm?: number;
}

export declare class CreateAnniversaryDto {
    title: string;
    date: Date;
    description?: string;
    member_id?: string;
}
export declare class UpdateAnniversaryDto {
    title?: string;
    date?: Date;
    description?: string;
    member_id?: string;
}
export declare class CreateEventDto {
    title: string;
    description?: string;
    date?: Date;
    location?: string;
    highlight?: boolean;
    images?: string[];
}
export declare class UpdateEventDto {
    title?: string;
    description?: string;
    date?: Date;
    location?: string;
    highlight?: boolean;
    images?: string[];
}

import { EventsService } from './events.service';
import { CreateAnniversaryDto, UpdateAnniversaryDto } from './dto/create-event.dto';
export declare class AnniversariesController {
    private readonly eventsService;
    constructor(eventsService: EventsService);
    getAnniversaries(member_id?: string, month?: number): Promise<({
        member: ({
            profile: {
                fullName: string;
                generation: number | null;
                occupation: string | null;
                address: string | null;
                biography: string | null;
                id: string;
                created_at: Date;
                notes: string | null;
                updated_at: Date;
                member_id: string;
            } | null;
        } & {
            name: string;
            gender: string | null;
            birthDate: string | null;
            deathDate: string | null;
            id: string;
            private_id: string | null;
            normalized_name: string | null;
            avatar_url: string | null;
            created_at: Date;
        }) | null;
    } & {
        description: string | null;
        title: string;
        id: string;
        created_at: Date;
        updated_at: Date;
        member_id: string | null;
        date: Date;
    })[]>;
    getUpcoming(): Promise<({
        member: ({
            profile: {
                fullName: string;
                generation: number | null;
                occupation: string | null;
                address: string | null;
                biography: string | null;
                id: string;
                created_at: Date;
                notes: string | null;
                updated_at: Date;
                member_id: string;
            } | null;
        } & {
            name: string;
            gender: string | null;
            birthDate: string | null;
            deathDate: string | null;
            id: string;
            private_id: string | null;
            normalized_name: string | null;
            avatar_url: string | null;
            created_at: Date;
        }) | null;
    } & {
        description: string | null;
        title: string;
        id: string;
        created_at: Date;
        updated_at: Date;
        member_id: string | null;
        date: Date;
    })[]>;
    getById(id: string): Promise<{
        member: ({
            profile: {
                fullName: string;
                generation: number | null;
                occupation: string | null;
                address: string | null;
                biography: string | null;
                id: string;
                created_at: Date;
                notes: string | null;
                updated_at: Date;
                member_id: string;
            } | null;
        } & {
            name: string;
            gender: string | null;
            birthDate: string | null;
            deathDate: string | null;
            id: string;
            private_id: string | null;
            normalized_name: string | null;
            avatar_url: string | null;
            created_at: Date;
        }) | null;
    } & {
        description: string | null;
        title: string;
        id: string;
        created_at: Date;
        updated_at: Date;
        member_id: string | null;
        date: Date;
    }>;
    create(dto: CreateAnniversaryDto): Promise<{
        member: ({
            profile: {
                fullName: string;
                generation: number | null;
                occupation: string | null;
                address: string | null;
                biography: string | null;
                id: string;
                created_at: Date;
                notes: string | null;
                updated_at: Date;
                member_id: string;
            } | null;
        } & {
            name: string;
            gender: string | null;
            birthDate: string | null;
            deathDate: string | null;
            id: string;
            private_id: string | null;
            normalized_name: string | null;
            avatar_url: string | null;
            created_at: Date;
        }) | null;
    } & {
        description: string | null;
        title: string;
        id: string;
        created_at: Date;
        updated_at: Date;
        member_id: string | null;
        date: Date;
    }>;
    update(id: string, dto: UpdateAnniversaryDto): Promise<{
        member: {
            name: string;
            gender: string | null;
            birthDate: string | null;
            deathDate: string | null;
            id: string;
            private_id: string | null;
            normalized_name: string | null;
            avatar_url: string | null;
            created_at: Date;
        } | null;
    } & {
        description: string | null;
        title: string;
        id: string;
        created_at: Date;
        updated_at: Date;
        member_id: string | null;
        date: Date;
    }>;
    delete(id: string): Promise<{
        description: string | null;
        title: string;
        id: string;
        created_at: Date;
        updated_at: Date;
        member_id: string | null;
        date: Date;
    }>;
}

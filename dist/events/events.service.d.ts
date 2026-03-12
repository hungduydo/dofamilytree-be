import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnniversaryDto, UpdateAnniversaryDto, CreateEventDto, UpdateEventDto } from './dto/create-event.dto';
export declare class EventsService {
    private readonly prisma;
    private notificationQueue;
    constructor(prisma: PrismaService, notificationQueue: Queue);
    getAnniversaries(filter: {
        member_id?: string;
        month?: number;
    }): Promise<({
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
    getUpcomingAnniversaries(days?: number): Promise<({
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
    getAnniversaryById(id: string): Promise<{
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
    createAnniversary(dto: CreateAnniversaryDto): Promise<{
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
    updateAnniversary(id: string, dto: UpdateAnniversaryDto): Promise<{
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
    deleteAnniversary(id: string): Promise<{
        description: string | null;
        title: string;
        id: string;
        created_at: Date;
        updated_at: Date;
        member_id: string | null;
        date: Date;
    }>;
    getEvents(filter: {
        highlight?: boolean;
        fromDate?: Date;
        toDate?: Date;
    }): Promise<{
        description: string | null;
        title: string;
        id: string;
        created_at: Date;
        updated_at: Date;
        date: Date | null;
        location: string | null;
        highlight: boolean;
        images: string[];
    }[]>;
    getEventById(id: string): Promise<{
        description: string | null;
        title: string;
        id: string;
        created_at: Date;
        updated_at: Date;
        date: Date | null;
        location: string | null;
        highlight: boolean;
        images: string[];
    }>;
    createEvent(dto: CreateEventDto): Promise<{
        description: string | null;
        title: string;
        id: string;
        created_at: Date;
        updated_at: Date;
        date: Date | null;
        location: string | null;
        highlight: boolean;
        images: string[];
    }>;
    updateEvent(id: string, dto: UpdateEventDto): Promise<{
        description: string | null;
        title: string;
        id: string;
        created_at: Date;
        updated_at: Date;
        date: Date | null;
        location: string | null;
        highlight: boolean;
        images: string[];
    }>;
    deleteEvent(id: string): Promise<{
        description: string | null;
        title: string;
        id: string;
        created_at: Date;
        updated_at: Date;
        date: Date | null;
        location: string | null;
        highlight: boolean;
        images: string[];
    }>;
}

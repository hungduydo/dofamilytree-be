import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto } from './dto/create-event.dto';
export declare class EventsController {
    private readonly eventsService;
    constructor(eventsService: EventsService);
    getEvents(highlight?: string, fromDate?: string, toDate?: string): Promise<{
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
    getById(id: string): Promise<{
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
    create(dto: CreateEventDto): Promise<{
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
    update(id: string, dto: UpdateEventDto): Promise<{
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
    delete(id: string): Promise<{
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

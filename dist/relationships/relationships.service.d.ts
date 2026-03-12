import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRelationshipDto, SearchRelationshipDto } from './dto/create-relationship.dto';
export declare class RelationshipsService {
    private readonly prisma;
    private notificationQueue;
    constructor(prisma: PrismaService, notificationQueue: Queue);
    addRelationship(dto: CreateRelationshipDto): Promise<{
        parent: {
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
        };
        child: {
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
        };
    } & {
        type: import("@prisma/client").$Enums.RelationshipNatureType;
        id: string;
        created_at: Date;
        parent_id: string;
        child_id: string;
        note: string | null;
    }>;
    getRelationships(memberId: string): Promise<({
        parent: {
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
        };
        child: {
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
        };
    } & {
        type: import("@prisma/client").$Enums.RelationshipNatureType;
        id: string;
        created_at: Date;
        parent_id: string;
        child_id: string;
        note: string | null;
    })[]>;
    getParents(memberId: string): Promise<({
        parent: {
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
        };
    } & {
        type: import("@prisma/client").$Enums.RelationshipNatureType;
        id: string;
        created_at: Date;
        parent_id: string;
        child_id: string;
        note: string | null;
    })[]>;
    getChildren(memberId: string): Promise<({
        child: {
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
        };
    } & {
        type: import("@prisma/client").$Enums.RelationshipNatureType;
        id: string;
        created_at: Date;
        parent_id: string;
        child_id: string;
        note: string | null;
    })[]>;
    getSpouses(memberId: string): Promise<({
        parent: {
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
        };
        child: {
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
        };
    } & {
        type: import("@prisma/client").$Enums.RelationshipNatureType;
        id: string;
        created_at: Date;
        parent_id: string;
        child_id: string;
        note: string | null;
    })[]>;
    getAncestors(memberId: string): Promise<any[]>;
    getDescendants(memberId: string): Promise<any[]>;
    searchRelationships(dto: SearchRelationshipDto): Promise<({
        parent: {
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
        };
        child: {
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
        };
    } & {
        type: import("@prisma/client").$Enums.RelationshipNatureType;
        id: string;
        created_at: Date;
        parent_id: string;
        child_id: string;
        note: string | null;
    })[]>;
    deleteRelationship(id: string): Promise<{
        type: import("@prisma/client").$Enums.RelationshipNatureType;
        id: string;
        created_at: Date;
        parent_id: string;
        child_id: string;
        note: string | null;
    }>;
}

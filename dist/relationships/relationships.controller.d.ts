import { RelationshipsService } from './relationships.service';
import { CreateRelationshipDto, SearchRelationshipDto } from './dto/create-relationship.dto';
export declare class RelationshipsController {
    private readonly relationshipsService;
    constructor(relationshipsService: RelationshipsService);
    getRelationships(id: string): Promise<({
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
    getParents(id: string): Promise<({
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
    getChildren(id: string): Promise<({
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
    getSpouses(id: string): Promise<({
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
    getAncestors(id: string): Promise<any[]>;
    getDescendants(id: string): Promise<any[]>;
    searchRelationships(query: SearchRelationshipDto): Promise<({
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
    addRelationship(dto: CreateRelationshipDto): Promise<{
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
    }>;
    deleteRelationship(id: string): Promise<{
        type: import("@prisma/client").$Enums.RelationshipNatureType;
        id: string;
        created_at: Date;
        parent_id: string;
        child_id: string;
        note: string | null;
    }>;
}

import { RelationshipsService } from './relationships.service';
import { CreateRelationshipDto, SearchRelationshipDto } from './dto/create-relationship.dto';
export declare class RelationshipsController {
    private readonly relationshipsService;
    constructor(relationshipsService: RelationshipsService);
    getRelationships(id: string): Promise<({
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
        note: string | null;
        parent_id: string;
        child_id: string;
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
        note: string | null;
        parent_id: string;
        child_id: string;
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
        note: string | null;
        parent_id: string;
        child_id: string;
    })[]>;
    getSpouses(id: string): Promise<({
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
        note: string | null;
        parent_id: string;
        child_id: string;
    })[]>;
    getAncestors(id: string): Promise<any[]>;
    getDescendants(id: string): Promise<any[]>;
    searchRelationships(query: SearchRelationshipDto): Promise<({
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
        note: string | null;
        parent_id: string;
        child_id: string;
    })[]>;
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
        note: string | null;
        parent_id: string;
        child_id: string;
    }>;
    deleteRelationship(id: string): Promise<{
        type: import("@prisma/client").$Enums.RelationshipNatureType;
        id: string;
        created_at: Date;
        note: string | null;
        parent_id: string;
        child_id: string;
    }>;
}

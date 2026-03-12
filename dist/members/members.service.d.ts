/// <reference types="multer" />
import { QStashService } from '../queue/qstash.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
export declare class MembersService {
    private readonly prisma;
    private readonly qstashService;
    constructor(prisma: PrismaService, qstashService: QStashService);
    getAllMembers(page?: number, pageSize?: number): Promise<{
        data: ({
            profile: {
                fullName: string;
                generation: number | null;
                occupation: string | null;
                address: string | null;
                biography: string | null;
                id: string;
                created_at: Date;
                member_id: string;
                notes: string | null;
                updated_at: Date;
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
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    searchMembers(query: string): Promise<({
        profile: {
            fullName: string;
            generation: number | null;
            occupation: string | null;
            address: string | null;
            biography: string | null;
            id: string;
            created_at: Date;
            member_id: string;
            notes: string | null;
            updated_at: Date;
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
    })[]>;
    getMemberById(id: string): Promise<{
        profile: {
            fullName: string;
            generation: number | null;
            occupation: string | null;
            address: string | null;
            biography: string | null;
            id: string;
            created_at: Date;
            member_id: string;
            notes: string | null;
            updated_at: Date;
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
    }>;
    getMemberProfile(id: string): Promise<{
        profile: {
            fullName: string;
            generation: number | null;
            occupation: string | null;
            address: string | null;
            biography: string | null;
            id: string;
            created_at: Date;
            member_id: string;
            notes: string | null;
            updated_at: Date;
        } | null;
        child_relationships: ({
            child: {
                profile: {
                    fullName: string;
                    generation: number | null;
                    occupation: string | null;
                    address: string | null;
                    biography: string | null;
                    id: string;
                    created_at: Date;
                    member_id: string;
                    notes: string | null;
                    updated_at: Date;
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
        })[];
        parent_relationships: ({
            parent: {
                profile: {
                    fullName: string;
                    generation: number | null;
                    occupation: string | null;
                    address: string | null;
                    biography: string | null;
                    id: string;
                    created_at: Date;
                    member_id: string;
                    notes: string | null;
                    updated_at: Date;
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
        })[];
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
    }>;
    createMember(dto: CreateMemberDto): Promise<{
        name: string;
        gender: string | null;
        birthDate: string | null;
        deathDate: string | null;
        id: string;
        private_id: string | null;
        normalized_name: string | null;
        avatar_url: string | null;
        created_at: Date;
    }>;
    updateMemberProfile(id: string, dto: UpdateMemberDto, avatarFile?: Express.Multer.File): Promise<{
        name: string;
        gender: string | null;
        birthDate: string | null;
        deathDate: string | null;
        id: string;
        private_id: string | null;
        normalized_name: string | null;
        avatar_url: string | null;
        created_at: Date;
    }>;
    deleteMember(id: string): Promise<void>;
}

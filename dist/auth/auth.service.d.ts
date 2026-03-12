/// <reference types="multer" />
import { JwtService } from '@nestjs/jwt';
import { QStashService } from '../queue/qstash.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
export declare const AVAILABLE_ROLES: {
    id: string;
    name: string;
    permissions: string[];
}[];
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    private readonly qstashService;
    private supabase;
    constructor(prisma: PrismaService, jwtService: JwtService, qstashService: QStashService);
    register(dto: RegisterDto, avatarFile?: Express.Multer.File): Promise<{
        id: string;
        email: string | undefined;
        name: string;
        roles: string[];
        profileMemberId: string | null;
    }>;
    login(dto: LoginDto): Promise<{
        token: string;
        user: {
            id: string;
            email: string | undefined;
            roles: string[];
            profileMemberId: string | null;
        };
    }>;
    logout(): Promise<{
        message: string;
    }>;
    changePassword(userId: string, dto: ChangePasswordDto): Promise<{
        message: string;
    }>;
    getMe(userId: string): Promise<{
        id: string;
        email: string | null;
        roles: string[];
        profileMemberId: string | null;
    }>;
    getRoles(): {
        id: string;
        name: string;
        permissions: string[];
    }[];
    assignRoles(requesterId: string, targetUserId: string, dto: AssignRolesDto): Promise<{
        message: string;
        roles: string[];
    }>;
}

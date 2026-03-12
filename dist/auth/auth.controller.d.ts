/// <reference types="multer" />
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto, profilePicture?: Express.Multer.File): Promise<{
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
    changePassword(user: {
        id: string;
    }, dto: ChangePasswordDto): Promise<{
        message: string;
    }>;
    getMe(user: {
        id: string;
    }): Promise<{
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
    assignRoles(user: {
        id: string;
    }, userId: string, dto: AssignRolesDto): Promise<{
        message: string;
        roles: string[];
    }>;
}

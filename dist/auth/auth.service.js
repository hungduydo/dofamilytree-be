"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = exports.AVAILABLE_ROLES = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bull_1 = require("@nestjs/bull");
const supabase_js_1 = require("@supabase/supabase-js");
const prisma_service_1 = require("../prisma/prisma.service");
const vietnamese_helper_1 = require("../utils/vietnamese-helper");
const queue_constants_1 = require("../queue/queue.constants");
exports.AVAILABLE_ROLES = [
    { id: 'guest-role-id', name: 'guest', permissions: ['read:public'] },
    { id: 'viewer-role-id', name: 'viewer', permissions: ['read:shared'] },
    { id: 'member-role-id', name: 'member', permissions: ['read:private'] },
    { id: 'editor-role-id', name: 'editor', permissions: ['manage:own_branch'] },
    { id: 'admin-role-id', name: 'admin', permissions: ['manage:roles', 'full:access'] },
];
let AuthService = class AuthService {
    constructor(prisma, jwtService, avatarQueue) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.avatarQueue = avatarQueue;
        this.supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
    async register(dto, avatarFile) {
        const { email, password, fullName, gender, birthDate, deathDate, generation, occupation, address, biography } = dto;
        const { data: authData, error: authError } = await this.supabase.auth.signUp({ email, password });
        if (authError) {
            if (authError.message.toLowerCase().includes('already registered')) {
                throw new common_1.ConflictException('User with this email already exists');
            }
            throw new common_1.BadRequestException(authError.message);
        }
        if (!authData.user) {
            throw new common_1.InternalServerErrorException('User not created in Supabase Auth');
        }
        const userId = authData.user.id;
        const { member, userMetadata } = await this.prisma.$transaction(async (tx) => {
            const newMember = await tx.member.create({
                data: {
                    name: fullName,
                    normalized_name: (0, vietnamese_helper_1.removeVietnameseTones)(fullName),
                    gender: gender ?? null,
                    birthDate: birthDate ?? null,
                    deathDate: deathDate ?? null,
                },
            });
            await tx.profile.create({
                data: {
                    member_id: newMember.id,
                    fullName,
                    generation: generation ?? null,
                    occupation: occupation ?? null,
                    address: address ?? null,
                    biography: biography ?? null,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });
            const meta = await tx.userMetadata.create({
                data: {
                    user_id: userId,
                    profile_member_id: newMember.id,
                    roles: ['member'],
                },
            });
            return { member: newMember, userMetadata: meta };
        });
        if (avatarFile) {
            await this.avatarQueue.add({
                memberId: member.id,
                buffer: avatarFile.buffer,
                filename: avatarFile.originalname,
                mimetype: avatarFile.mimetype,
            });
        }
        return {
            id: userId,
            email: authData.user.email,
            name: fullName,
            roles: userMetadata.roles,
            profileMemberId: userMetadata.profile_member_id,
        };
    }
    async login(dto) {
        const { email, password } = dto;
        const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
        if (error || !data.user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const userMetadata = await this.prisma.userMetadata.findUnique({
            where: { user_id: data.user.id },
        });
        if (!userMetadata) {
            throw new common_1.UnauthorizedException('User profile data missing');
        }
        const payload = {
            sub: data.user.id,
            email: data.user.email,
            roles: userMetadata.roles,
            profileMemberId: userMetadata.profile_member_id,
        };
        const token = this.jwtService.sign(payload, { expiresIn: '1d' });
        return {
            token,
            user: {
                id: data.user.id,
                email: data.user.email,
                roles: userMetadata.roles,
                profileMemberId: userMetadata.profile_member_id,
            },
        };
    }
    async logout() {
        return { message: 'Logout successful' };
    }
    async changePassword(userId, dto) {
        const { currentPassword, newPassword } = dto;
        const { data: userData, error: fetchError } = await this.supabase.auth.admin.getUserById(userId);
        if (fetchError || !userData.user?.email) {
            throw new common_1.InternalServerErrorException('Failed to retrieve user');
        }
        const { error: verifyError } = await this.supabase.auth.signInWithPassword({
            email: userData.user.email,
            password: currentPassword,
        });
        if (verifyError) {
            throw new common_1.UnauthorizedException('Current password is incorrect');
        }
        const { error: updateError } = await this.supabase.auth.admin.updateUserById(userId, {
            password: newPassword,
        });
        if (updateError) {
            throw new common_1.InternalServerErrorException('Failed to update password');
        }
        return { message: 'Password updated successfully' };
    }
    async getMe(userId) {
        const userMetadata = await this.prisma.userMetadata.findUnique({
            where: { user_id: userId },
        });
        if (!userMetadata) {
            throw new common_1.UnauthorizedException('User not found');
        }
        const { data: userData } = await this.supabase.auth.admin.getUserById(userId);
        return {
            id: userId,
            email: userData?.user?.email ?? null,
            roles: userMetadata.roles,
            profileMemberId: userMetadata.profile_member_id,
        };
    }
    getRoles() {
        return exports.AVAILABLE_ROLES;
    }
    async assignRoles(requesterId, targetUserId, dto) {
        const requesterMeta = await this.prisma.userMetadata.findUnique({
            where: { user_id: requesterId },
        });
        if (!requesterMeta?.roles.includes('admin')) {
            throw new common_1.ForbiddenException('Admin role required to assign roles');
        }
        const targetMeta = await this.prisma.userMetadata.findUnique({
            where: { user_id: targetUserId },
        });
        if (!targetMeta) {
            throw new common_1.NotFoundException(`User ${targetUserId} not found`);
        }
        const updated = await this.prisma.userMetadata.update({
            where: { user_id: targetUserId },
            data: { roles: dto.roles },
        });
        return {
            message: `Roles updated for user ${targetUserId}`,
            roles: updated.roles,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, bull_1.InjectQueue)(queue_constants_1.QUEUE_AVATAR_UPLOAD)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService, Object])
], AuthService);
//# sourceMappingURL=auth.service.js.map
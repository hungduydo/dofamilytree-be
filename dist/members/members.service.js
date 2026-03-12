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
exports.MembersService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const prisma_service_1 = require("../prisma/prisma.service");
const vietnamese_helper_1 = require("../utils/vietnamese-helper");
const queue_constants_1 = require("../queue/queue.constants");
let MembersService = class MembersService {
    constructor(prisma, avatarQueue, reportQueue, notificationQueue) {
        this.prisma = prisma;
        this.avatarQueue = avatarQueue;
        this.reportQueue = reportQueue;
        this.notificationQueue = notificationQueue;
    }
    async getAllMembers(page = 1, pageSize = 10) {
        const skip = (page - 1) * pageSize;
        const take = Math.min(pageSize, 100);
        const [data, total] = await Promise.all([
            this.prisma.member.findMany({
                skip,
                take,
                include: { profile: true },
                orderBy: { created_at: 'desc' },
            }),
            this.prisma.member.count(),
        ]);
        return { data, total, page, pageSize };
    }
    async searchMembers(query) {
        const normalized = (0, vietnamese_helper_1.removeVietnameseTones)(query);
        return this.prisma.member.findMany({
            where: {
                normalized_name: { contains: normalized, mode: 'insensitive' },
            },
            include: { profile: true },
            take: 50,
        });
    }
    async getMemberById(id) {
        const member = await this.prisma.member.findUnique({
            where: { id },
            include: { profile: true },
        });
        if (!member)
            throw new common_1.NotFoundException(`Member ${id} not found`);
        return member;
    }
    async getMemberProfile(id) {
        const member = await this.prisma.member.findUnique({
            where: { id },
            include: {
                profile: true,
                parent_relationships: { include: { parent: { include: { profile: true } } } },
                child_relationships: { include: { child: { include: { profile: true } } } },
            },
        });
        if (!member)
            throw new common_1.NotFoundException(`Member ${id} not found`);
        return member;
    }
    async createMember(dto) {
        if (!dto.fullName?.trim()) {
            throw new common_1.BadRequestException('fullName is required');
        }
        const normalizedName = (0, vietnamese_helper_1.removeVietnameseTones)(dto.fullName);
        const member = await this.prisma.$transaction(async (tx) => {
            const newMember = await tx.member.create({
                data: {
                    name: dto.fullName,
                    normalized_name: normalizedName,
                    gender: dto.gender,
                    birthDate: dto.birthDate,
                    deathDate: dto.deathDate,
                },
            });
            await tx.profile.create({
                data: {
                    member_id: newMember.id,
                    fullName: dto.fullName,
                    generation: dto.generation,
                    occupation: dto.occupation,
                    address: dto.address,
                    biography: dto.biography,
                },
            });
            return newMember;
        });
        await Promise.all([
            this.notificationQueue.add({ type: 'NEW_MEMBER', payload: { id: member.id, name: member.name } }),
            this.reportQueue.add({}),
        ]);
        return member;
    }
    async updateMemberProfile(id, dto, avatarFile) {
        const existing = await this.prisma.member.findUnique({
            where: { id },
            include: { profile: true },
        });
        if (!existing)
            throw new common_1.NotFoundException(`Member ${id} not found`);
        const updated = await this.prisma.$transaction(async (tx) => {
            const memberData = {};
            if (dto.fullName) {
                memberData.name = dto.fullName;
                memberData.normalized_name = (0, vietnamese_helper_1.removeVietnameseTones)(dto.fullName);
            }
            if (dto.gender)
                memberData.gender = dto.gender;
            if (dto.birthDate !== undefined)
                memberData.birthDate = dto.birthDate;
            if (dto.deathDate !== undefined)
                memberData.deathDate = dto.deathDate;
            const updatedMember = await tx.member.update({ where: { id }, data: memberData });
            const profileData = {};
            if (dto.fullName)
                profileData.fullName = dto.fullName;
            if (dto.generation !== undefined)
                profileData.generation = dto.generation;
            if (dto.occupation !== undefined)
                profileData.occupation = dto.occupation;
            if (dto.address !== undefined)
                profileData.address = dto.address;
            if (dto.biography !== undefined)
                profileData.biography = dto.biography;
            if (dto.notes !== undefined)
                profileData.notes = dto.notes;
            if (Object.keys(profileData).length > 0 && existing.profile) {
                await tx.profile.update({ where: { member_id: id }, data: profileData });
            }
            return updatedMember;
        });
        if (avatarFile) {
            await this.avatarQueue.add({
                memberId: id,
                buffer: avatarFile.buffer,
                filename: avatarFile.originalname,
                mimetype: avatarFile.mimetype,
            });
        }
        return updated;
    }
    async deleteMember(id) {
        const member = await this.prisma.member.findUnique({ where: { id } });
        if (!member)
            throw new common_1.NotFoundException(`Member ${id} not found`);
        await this.prisma.$transaction(async (tx) => {
            await tx.profile.delete({ where: { member_id: id } }).catch(() => { });
            await tx.userMetadata.deleteMany({ where: { profile_member_id: id } });
            await tx.member.delete({ where: { id } });
        });
        await this.reportQueue.add({});
    }
};
exports.MembersService = MembersService;
exports.MembersService = MembersService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bull_1.InjectQueue)(queue_constants_1.QUEUE_AVATAR_UPLOAD)),
    __param(2, (0, bull_1.InjectQueue)(queue_constants_1.QUEUE_REPORT_GENERATE)),
    __param(3, (0, bull_1.InjectQueue)(queue_constants_1.QUEUE_NOTIFICATION)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object, Object, Object])
], MembersService);
//# sourceMappingURL=members.service.js.map
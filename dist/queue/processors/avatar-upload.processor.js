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
var AvatarUploadProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AvatarUploadProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const blob_1 = require("@vercel/blob");
const prisma_service_1 = require("../../prisma/prisma.service");
const queue_constants_1 = require("../queue.constants");
let AvatarUploadProcessor = AvatarUploadProcessor_1 = class AvatarUploadProcessor {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(AvatarUploadProcessor_1.name);
    }
    async handleAvatarUpload(job) {
        const { memberId, buffer, filename, mimetype } = job.data;
        this.logger.log(`Processing avatar upload for member ${memberId}`);
        try {
            const blob = await (0, blob_1.put)(`avatars/${memberId}/${filename}`, Buffer.from(buffer), {
                access: 'public',
                contentType: mimetype,
                token: process.env.BLOB_READ_WRITE_TOKEN,
            });
            await this.prisma.member.update({
                where: { id: memberId },
                data: { avatar_url: blob.url },
            });
            this.logger.log(`Avatar uploaded successfully for member ${memberId}: ${blob.url}`);
            return { url: blob.url };
        }
        catch (error) {
            this.logger.error(`Failed to upload avatar for member ${memberId}`, error);
            throw error;
        }
    }
};
exports.AvatarUploadProcessor = AvatarUploadProcessor;
__decorate([
    (0, bull_1.Process)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AvatarUploadProcessor.prototype, "handleAvatarUpload", null);
exports.AvatarUploadProcessor = AvatarUploadProcessor = AvatarUploadProcessor_1 = __decorate([
    (0, bull_1.Processor)(queue_constants_1.QUEUE_AVATAR_UPLOAD),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AvatarUploadProcessor);
//# sourceMappingURL=avatar-upload.processor.js.map
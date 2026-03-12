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
exports.MediaService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const blob_1 = require("@vercel/blob");
const prisma_service_1 = require("../prisma/prisma.service");
const queue_constants_1 = require("../queue/queue.constants");
let MediaService = class MediaService {
    constructor(prisma, imageProcessQueue) {
        this.prisma = prisma;
        this.imageProcessQueue = imageProcessQueue;
    }
    async uploadMedia(file, uploaderId) {
        const media = await this.prisma.media.create({
            data: {
                file_path: `/pending/${Date.now()}_${file.originalname}`,
                uploader_id: uploaderId,
            },
        });
        await this.imageProcessQueue.add({
            mediaId: media.id,
            buffer: file.buffer,
            filename: file.originalname,
            mimetype: file.mimetype,
        });
        return media;
    }
    async getMedia(filter) {
        return this.prisma.media.findMany({
            where: filter.uploader_id ? { uploader_id: filter.uploader_id } : {},
            orderBy: { created_at: 'desc' },
        });
    }
    async deleteMedia(id) {
        const media = await this.prisma.media.findUnique({ where: { id } });
        if (!media)
            throw new common_1.NotFoundException(`Media ${id} not found`);
        if (media.file_path.startsWith('https://')) {
            await (0, blob_1.del)(media.file_path, { token: process.env.BLOB_READ_WRITE_TOKEN });
        }
        return this.prisma.media.delete({ where: { id } });
    }
};
exports.MediaService = MediaService;
exports.MediaService = MediaService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bull_1.InjectQueue)(queue_constants_1.QUEUE_IMAGE_PROCESS)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object])
], MediaService);
//# sourceMappingURL=media.service.js.map
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaService = void 0;
const common_1 = require("@nestjs/common");
const qstash_service_1 = require("../queue/qstash.service");
const blob_1 = require("@vercel/blob");
const prisma_service_1 = require("../prisma/prisma.service");
const queue_constants_1 = require("../queue/queue.constants");
let MediaService = class MediaService {
    constructor(prisma, qstashService) {
        this.prisma = prisma;
        this.qstashService = qstashService;
    }
    async uploadMedia(file, uploaderId) {
        const media = await this.prisma.media.create({
            data: {
                file_path: `/pending/${Date.now()}_${file.originalname}`,
                uploader_id: uploaderId,
            },
        });
        await this.qstashService.publish(queue_constants_1.QUEUE_IMAGE_PROCESS, {
            mediaId: media.id,
            buffer: file.buffer.toString('base64'),
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
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        qstash_service_1.QStashService])
], MediaService);
//# sourceMappingURL=media.service.js.map
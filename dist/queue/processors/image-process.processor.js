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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ImageProcessProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageProcessProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const blob_1 = require("@vercel/blob");
const sharp_1 = __importDefault(require("sharp"));
const prisma_service_1 = require("../../prisma/prisma.service");
const queue_constants_1 = require("../queue.constants");
let ImageProcessProcessor = ImageProcessProcessor_1 = class ImageProcessProcessor {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ImageProcessProcessor_1.name);
    }
    async handleImageProcess(job) {
        const { mediaId, buffer, filename, mimetype } = job.data;
        this.logger.log(`Processing image for media ${mediaId}`);
        try {
            const imageBuffer = Buffer.from(buffer);
            const [thumbnail, fullSize] = await Promise.all([
                (0, sharp_1.default)(imageBuffer).resize(300).toBuffer(),
                (0, sharp_1.default)(imageBuffer).resize(1200, undefined, { withoutEnlargement: true }).toBuffer(),
            ]);
            const ext = filename.split('.').pop() || 'jpg';
            const baseName = `media/${mediaId}`;
            const [thumbBlob, fullBlob] = await Promise.all([
                (0, blob_1.put)(`${baseName}_thumb.${ext}`, thumbnail, {
                    access: 'public',
                    contentType: mimetype,
                    token: process.env.BLOB_READ_WRITE_TOKEN,
                }),
                (0, blob_1.put)(`${baseName}_full.${ext}`, fullSize, {
                    access: 'public',
                    contentType: mimetype,
                    token: process.env.BLOB_READ_WRITE_TOKEN,
                }),
            ]);
            await this.prisma.media.update({
                where: { id: mediaId },
                data: { file_path: fullBlob.url },
            });
            this.logger.log(`Image processed: ${fullBlob.url} (thumb: ${thumbBlob.url})`);
            return { full: fullBlob.url, thumb: thumbBlob.url };
        }
        catch (error) {
            this.logger.error(`Failed to process image for media ${mediaId}`, error);
            throw error;
        }
    }
};
exports.ImageProcessProcessor = ImageProcessProcessor;
__decorate([
    (0, bull_1.Process)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ImageProcessProcessor.prototype, "handleImageProcess", null);
exports.ImageProcessProcessor = ImageProcessProcessor = ImageProcessProcessor_1 = __decorate([
    (0, bull_1.Processor)(queue_constants_1.QUEUE_IMAGE_PROCESS),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ImageProcessProcessor);
//# sourceMappingURL=image-process.processor.js.map
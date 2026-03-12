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
exports.GravesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
let GravesService = class GravesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getAllGraves(filter) {
        return this.prisma.cemetery.findMany({
            where: filter.name ? { name: { contains: filter.name, mode: 'insensitive' } } : {},
            orderBy: { created_at: 'desc' },
        });
    }
    async getGraveById(id) {
        const grave = await this.prisma.cemetery.findUnique({ where: { id } });
        if (!grave)
            throw new common_1.NotFoundException(`Grave ${id} not found`);
        return grave;
    }
    async getNearbyGraves(params) {
        const radius = params.radiusKm ?? 10;
        const all = await this.prisma.cemetery.findMany();
        return all.filter((g) => haversineDistance(params.lat, params.lng, g.latitude, g.longitude) <= radius);
    }
    async createGrave(dto) {
        return this.prisma.cemetery.create({ data: dto });
    }
    async updateGrave(id, dto) {
        await this.getGraveById(id);
        return this.prisma.cemetery.update({ where: { id }, data: dto });
    }
    async deleteGrave(id) {
        await this.getGraveById(id);
        return this.prisma.cemetery.delete({ where: { id } });
    }
};
exports.GravesService = GravesService;
exports.GravesService = GravesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GravesService);
//# sourceMappingURL=graves.service.js.map
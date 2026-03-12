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
exports.EventsService = void 0;
const common_1 = require("@nestjs/common");
const qstash_service_1 = require("../queue/qstash.service");
const prisma_service_1 = require("../prisma/prisma.service");
const queue_constants_1 = require("../queue/queue.constants");
let EventsService = class EventsService {
    constructor(prisma, qstashService) {
        this.prisma = prisma;
        this.qstashService = qstashService;
    }
    async getAnniversaries(filter) {
        const where = {};
        if (filter.member_id)
            where.member_id = filter.member_id;
        if (filter.month) {
            const year = new Date().getFullYear();
            const start = new Date(year, filter.month - 1, 1);
            const end = new Date(year, filter.month, 0, 23, 59, 59);
            where.date = { gte: start, lte: end };
        }
        return this.prisma.anniversary.findMany({
            where,
            include: { member: { include: { profile: true } } },
            orderBy: { date: 'asc' },
        });
    }
    async getUpcomingAnniversaries(days = 30) {
        const now = new Date();
        const future = new Date();
        future.setDate(future.getDate() + days);
        return this.prisma.anniversary.findMany({
            where: { date: { gte: now, lte: future } },
            include: { member: { include: { profile: true } } },
            orderBy: { date: 'asc' },
        });
    }
    async getAnniversaryById(id) {
        const ann = await this.prisma.anniversary.findUnique({
            where: { id },
            include: { member: { include: { profile: true } } },
        });
        if (!ann)
            throw new common_1.NotFoundException(`Anniversary ${id} not found`);
        return ann;
    }
    async createAnniversary(dto) {
        return this.prisma.anniversary.create({
            data: {
                title: dto.title,
                date: dto.date,
                description: dto.description,
                member_id: dto.member_id,
            },
            include: { member: { include: { profile: true } } },
        });
    }
    async updateAnniversary(id, dto) {
        await this.getAnniversaryById(id);
        return this.prisma.anniversary.update({
            where: { id },
            data: dto,
            include: { member: true },
        });
    }
    async deleteAnniversary(id) {
        await this.getAnniversaryById(id);
        return this.prisma.anniversary.delete({ where: { id } });
    }
    async getEvents(filter) {
        const where = {};
        if (filter.highlight !== undefined)
            where.highlight = filter.highlight;
        if (filter.fromDate || filter.toDate) {
            where.date = {};
            if (filter.fromDate)
                where.date.gte = filter.fromDate;
            if (filter.toDate)
                where.date.lte = filter.toDate;
        }
        return this.prisma.event.findMany({
            where,
            orderBy: { date: 'desc' },
        });
    }
    async getEventById(id) {
        const event = await this.prisma.event.findUnique({ where: { id } });
        if (!event)
            throw new common_1.NotFoundException(`Event ${id} not found`);
        return event;
    }
    async createEvent(dto) {
        const event = await this.prisma.event.create({
            data: {
                title: dto.title,
                description: dto.description,
                date: dto.date,
                location: dto.location,
                highlight: dto.highlight ?? false,
                images: dto.images ?? [],
            },
        });
        await this.qstashService.publish(queue_constants_1.QUEUE_NOTIFICATION, {
            type: 'NEW_EVENT',
            message: `New event: ${event.title}`,
            payload: { id: event.id, title: event.title, date: event.date },
        });
        return event;
    }
    async updateEvent(id, dto) {
        await this.getEventById(id);
        return this.prisma.event.update({ where: { id }, data: dto });
    }
    async deleteEvent(id) {
        await this.getEventById(id);
        return this.prisma.event.delete({ where: { id } });
    }
};
exports.EventsService = EventsService;
exports.EventsService = EventsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        qstash_service_1.QStashService])
], EventsService);
//# sourceMappingURL=events.service.js.map
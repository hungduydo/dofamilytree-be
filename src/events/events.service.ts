import { Injectable, NotFoundException } from '@nestjs/common';
import { QStashService } from '../queue/qstash.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAnniversaryDto, UpdateAnniversaryDto,
  CreateEventDto, UpdateEventDto,
} from './dto/create-event.dto';
import { QUEUE_NOTIFICATION } from '../queue/queue.constants';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qstashService: QStashService,
  ) {}

  // ─── Anniversary ──────────────────────────────────────────────────────────

  async getAnniversaries(filter: { member_id?: string; month?: number }) {
    const where: any = {};
    if (filter.member_id) where.member_id = filter.member_id;
    if (filter.month) {
      // Filter by month (1-12) — compare month of date field
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

  async getAnniversaryById(id: string) {
    const ann = await this.prisma.anniversary.findUnique({
      where: { id },
      include: { member: { include: { profile: true } } },
    });
    if (!ann) throw new NotFoundException(`Anniversary ${id} not found`);
    return ann;
  }

  async createAnniversary(dto: CreateAnniversaryDto) {
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

  async updateAnniversary(id: string, dto: UpdateAnniversaryDto) {
    await this.getAnniversaryById(id);
    return this.prisma.anniversary.update({
      where: { id },
      data: dto,
      include: { member: true },
    });
  }

  async deleteAnniversary(id: string) {
    await this.getAnniversaryById(id);
    return this.prisma.anniversary.delete({ where: { id } });
  }

  // ─── Event ────────────────────────────────────────────────────────────────

  async getEvents(filter: { highlight?: boolean; fromDate?: Date; toDate?: Date }) {
    const where: any = {};
    if (filter.highlight !== undefined) where.highlight = filter.highlight;
    if (filter.fromDate || filter.toDate) {
      where.date = {};
      if (filter.fromDate) where.date.gte = filter.fromDate;
      if (filter.toDate) where.date.lte = filter.toDate;
    }

    return this.prisma.event.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async getEventById(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    return event;
  }

  async createEvent(dto: CreateEventDto) {
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

    await this.qstashService.publish(QUEUE_NOTIFICATION, {
      type: 'NEW_EVENT',
      message: `New event: ${event.title}`,
      payload: { id: event.id, title: event.title, date: event.date },
    });

    return event;
  }

  async updateEvent(id: string, dto: UpdateEventDto) {
    await this.getEventById(id);
    return this.prisma.event.update({ where: { id }, data: dto });
  }

  async deleteEvent(id: string) {
    await this.getEventById(id);
    return this.prisma.event.delete({ where: { id } });
  }
}

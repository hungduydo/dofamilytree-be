import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { QStashService } from '../queue/qstash.service';
import { runInBackground } from '../utils/run-in-background';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  CreateAnniversaryDto, UpdateAnniversaryDto,
  CreateEventDto, UpdateEventDto,
} from './dto/create-event.dto';
import { QUEUE_NOTIFICATION } from '../queue/queue.constants';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qstashService: QStashService,
    private readonly storage: StorageService,
  ) {}

  /** Upload event image files lên storage provider active và trả về URL public. */
  private async uploadImages(files?: Express.Multer.File[]): Promise<string[]> {
    const valid = (files ?? []).filter((f) => f.buffer && f.size > 0);
    const urls: string[] = [];
    for (const file of valid) {
      try {
        const url = await this.storage.put(`events/${Date.now()}-${file.originalname}`, file.buffer, file.mimetype);
        urls.push(url);
      } catch (error) {
        // Don't fail event creation just because an image upload failed.
        this.logger.error(`Failed to upload event image ${file.originalname}`, error as Error);
      }
    }
    return urls;
  }

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
      include: { member: { include: { profile: true } }, cemetery: true },
      orderBy: { date: 'asc' },
    });
  }

  async getUpcomingAnniversaries(days = 30) {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    return this.prisma.anniversary.findMany({
      where: { date: { gte: now, lte: future } },
      include: { member: { include: { profile: true } }, cemetery: true },
      orderBy: { date: 'asc' },
    });
  }

  async getAnniversaryById(id: string) {
    const ann = await this.prisma.anniversary.findUnique({
      where: { id },
      include: { member: { include: { profile: true } }, cemetery: true },
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
        cemetery_id: dto.cemetery_id,
        isLunar: dto.isLunar ?? false,
      },
      include: { member: { include: { profile: true } }, cemetery: true },
    });
  }

  async updateAnniversary(id: string, dto: UpdateAnniversaryDto) {
    await this.getAnniversaryById(id);
    return this.prisma.anniversary.update({
      where: { id },
      data: dto,
      include: { member: { include: { profile: true } }, cemetery: true },
    });
  }

  async deleteAnniversary(id: string) {
    await this.getAnniversaryById(id);
    return this.prisma.anniversary.delete({ where: { id } });
  }

  // ─── Gallery (public homepage) ────────────────────────────────────────────

  async getGalleryEvents() {
    const events = await this.prisma.event.findMany({
      where: {
        highlight: true,
        images: { isEmpty: false },
      },
      include: { _count: { select: { attendees: true } } },
      orderBy: { date: 'desc' },
    });
    return events.map((e) => this.withAttendeeCount(e));
  }

  // ─── Event ────────────────────────────────────────────────────────────────

  /** Flatten Prisma's `_count.attendees` into a plain `attendeeCount` field for the API. */
  private withAttendeeCount<T extends { _count?: { attendees: number } }>(event: T) {
    const { _count, ...rest } = event;
    return { ...rest, attendeeCount: _count?.attendees ?? 0 };
  }

  async getEvents(filter: { highlight?: boolean; fromDate?: Date; toDate?: Date; category?: string }) {
    const where: any = {};
    if (filter.highlight !== undefined) where.highlight = filter.highlight;
    if (filter.category) where.category = filter.category;
    if (filter.fromDate || filter.toDate) {
      where.date = {};
      if (filter.fromDate) where.date.gte = filter.fromDate;
      if (filter.toDate) where.date.lte = filter.toDate;
    }

    const events = await this.prisma.event.findMany({
      where,
      include: { _count: { select: { attendees: true } } },
      orderBy: { date: 'desc' },
    });
    return events.map((e) => this.withAttendeeCount(e));
  }

  async getEventById(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { _count: { select: { attendees: true } } },
    });
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    return this.withAttendeeCount(event);
  }

  async createEvent(dto: CreateEventDto, files?: Express.Multer.File[]) {
    const uploaded = await this.uploadImages(files);
    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        date: dto.date,
        end_date: dto.end_date,
        location: dto.location,
        category: dto.category,
        isLunar: dto.isLunar ?? false,
        highlight: dto.highlight ?? false,
        images: uploaded.length ? uploaded : (dto.images ?? []),
      },
    });

    runInBackground(
      this.qstashService.publish(QUEUE_NOTIFICATION, {
        type: 'NEW_EVENT',
        message: `New event: ${event.title}`,
        payload: { id: event.id, title: event.title, date: event.date },
      }),
    );

    return event;
  }

  async updateEvent(id: string, dto: UpdateEventDto, files?: Express.Multer.File[]) {
    await this.getEventById(id);
    const uploaded = await this.uploadImages(files);
    const { existingImages, ...data } = dto as UpdateEventDto & { existingImages?: string[] };
    const nextData: Record<string, unknown> = { ...data };
    // When the client manages the gallery (sends kept URLs and/or new files),
    // the final list is kept-images + newly-uploaded ones. Otherwise leave images untouched.
    if (existingImages !== undefined || uploaded.length) {
      nextData.images = [...(existingImages ?? []), ...uploaded];
    }
    return this.prisma.event.update({ where: { id }, data: nextData });
  }

  async deleteEvent(id: string) {
    await this.getEventById(id);
    return this.prisma.event.delete({ where: { id } });
  }

  // ─── Event attendees ──────────────────────────────────────────────────────

  async getAttendees(eventId: string) {
    await this.getEventById(eventId);
    return this.prisma.eventAttendee.findMany({
      where: { event_id: eventId },
      include: { member: { include: { profile: true } } },
      orderBy: { created_at: 'asc' },
    });
  }

  async addAttendee(eventId: string, memberId: string, rsvpStatus = 'going') {
    await this.getEventById(eventId);
    return this.prisma.eventAttendee.upsert({
      where: { event_id_member_id: { event_id: eventId, member_id: memberId } },
      create: { event_id: eventId, member_id: memberId, rsvp_status: rsvpStatus },
      update: { rsvp_status: rsvpStatus },
      include: { member: { include: { profile: true } } },
    });
  }

  async removeAttendee(eventId: string, memberId: string) {
    await this.prisma.eventAttendee.deleteMany({
      where: { event_id: eventId, member_id: memberId },
    });
  }
}

import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QStashService } from '../queue/qstash.service';
import { runInBackground } from '../utils/run-in-background';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  CreateAnniversaryDto, UpdateAnniversaryDto,
  CreateEventDto, UpdateEventDto,
} from './dto/create-event.dto';
import { QUEUE_NOTIFICATION } from '../queue/queue.constants';
import { profileSelectFor } from '../members/members.select';
import { DECEASED_WHERE, parseBirthYear } from '../members/life-status';
import { todayInVietnam } from '../memorial/memorial.service';
import { SolarDate, solarToLunar } from '../utils/lunar-calendar';
import {
  AnniversaryKind, UPCOMING_MAX_DAYS, nextOccurrence, parseIsoDay, recurringDateError,
} from './anniversary-occurrence';

// Các endpoint dưới đây nhúng profile của member. Chúng KHÔNG bao giờ trả 4 cột
// liên lạc (phone/contactEmail/address/notes) — kể cả cho admin — vì nhiều route
// trong file này là @Public(). Ai cần số điện thoại thì gọi
// GET /v2/members/:id/profile, nơi có kiểm tra role thật sự.
const EMBEDDED_PROFILE = profileSelectFor(false);

// Người được tưởng niệm: chỉ những gì một dòng danh sách cần, không liên lạc.
const ANNIVERSARY_INCLUDE = {
  member: { select: { id: true, name: true, avatar_url: true, generation: true, deathDate: true } },
  cemetery: { select: { id: true, name: true } },
} satisfies Prisma.AnniversaryInclude;

type AnniversaryRow = Prisma.AnniversaryGetPayload<{ include: typeof ANNIVERSARY_INCLUDE }>;

/** Row Prisma → AnniversaryResponseDto, kèm lần kế tiếp tính từ `today` (giờ VN). */
export function toAnniversaryDto(row: AnniversaryRow, today: SolarDate) {
  const next = nextOccurrence(row, today);
  // Lần giỗ thứ mấy — so năm dương với năm dương của deathDate (chuỗi tự do, có thể lệch 1 năm
  // khi người mất vào cuối năm âm). parseBirthYear chỉ là bộ đọc năm, dùng được cho ngày mất.
  const deathYear = row.member ? parseBirthYear(row.member.deathDate) : null;
  const occurrenceYear = Number(next.date.slice(0, 4));
  const yearsSinceDeath = deathYear !== null && occurrenceYear > deathYear ? occurrenceYear - deathYear : null;
  return {
    id: row.id,
    kind: row.kind,
    calendar: row.calendar,
    day: row.day,
    month: row.month,
    isLeapMonth: row.isLeapMonth,
    title: row.title,
    displayTitle: row.title || (row.member ? `Kỵ ${row.member.name}` : 'Ngày tưởng niệm'),
    description: row.description,
    member_id: row.member_id,
    cemetery_id: row.cemetery_id,
    nextOccurrence: next.date,
    daysUntil: next.daysUntil,
    yearsSinceDeath,
    created_at: row.created_at,
    updated_at: row.updated_at,
    member: row.member,
    cemetery: row.cemetery,
  };
}

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
  //
  // Ngày kỵ lưu ngày/tháng lặp lại; ngày dương được quy đổi ở đây, trong bộ nhớ.
  // Cả dòng họ chỉ vài trăm dòng nên "lấy hết rồi lọc" rẻ hơn mọi cách lưu sẵn.

  /** Chỉ kỵ của người vẫn đang là DECEASED — đổi trạng thái thì kỵ tự ẩn. */
  private readonly visibleAnniversaryWhere: Prisma.AnniversaryWhereInput = {
    OR: [{ kind: { not: 'DEATH' } }, { member: DECEASED_WHERE }],
  };

  private async findAnniversaryRows(where: Prisma.AnniversaryWhereInput = {}) {
    return this.prisma.anniversary.findMany({
      where: { AND: [this.visibleAnniversaryWhere, where] },
      include: ANNIVERSARY_INCLUDE,
    });
  }

  async getAnniversaries(
    filter: { member_id?: string; kind?: AnniversaryKind; month?: number } = {},
    now: Date = new Date(),
  ) {
    const where: Prisma.AnniversaryWhereInput = {};
    if (filter.member_id) where.member_id = filter.member_id;
    if (filter.kind) where.kind = filter.kind;
    // Tháng của CHÍNH ngày kỵ (tháng âm với kỵ âm lịch), không phải tháng dương.
    if (filter.month) where.month = filter.month;

    const today = parseIsoDay(todayInVietnam(now));
    return (await this.findAnniversaryRows(where))
      .map((row) => toAnniversaryDto(row, today))
      .sort((a, b) => a.month - b.month || a.day - b.day || a.displayTitle.localeCompare(b.displayTitle, 'vi'));
  }

  async getUpcomingAnniversaries(days = 30, now: Date = new Date()) {
    const window = Math.min(Math.max(days, 0), UPCOMING_MAX_DAYS);
    const today = parseIsoDay(todayInVietnam(now));
    return (await this.findAnniversaryRows())
      .map((row) => toAnniversaryDto(row, today))
      .filter((a) => a.daysUntil <= window)
      .sort((a, b) => a.daysUntil - b.daysUntil || a.displayTitle.localeCompare(b.displayTitle, 'vi'));
  }

  async getTodayAnniversaries(now: Date = new Date()) {
    const date = todayInVietnam(now);
    const today = parseIsoDay(date);
    return {
      date,
      lunar: solarToLunar(today.day, today.month, today.year),
      items: await this.getUpcomingAnniversaries(0, now),
    };
  }

  async getAnniversaryById(id: string, now: Date = new Date()) {
    const row = await this.prisma.anniversary.findUnique({ where: { id }, include: ANNIVERSARY_INCLUDE });
    if (!row) throw new NotFoundException(`Anniversary ${id} not found`);
    return toAnniversaryDto(row, parseIsoDay(todayInVietnam(now)));
  }

  async createAnniversary(dto: CreateAnniversaryDto) {
    const data = {
      kind: dto.kind ?? 'DEATH',
      calendar: dto.calendar ?? 'LUNAR',
      day: dto.day,
      month: dto.month,
      isLeapMonth: dto.isLeapMonth ?? false,
      title: dto.title?.trim() || null,
      description: dto.description?.trim() || null,
      member_id: dto.member_id ?? null,
      cemetery_id: dto.cemetery_id ?? null,
    };
    await this.assertValidAnniversary(data);
    const row = await this.withDeathConflict(() =>
      this.prisma.anniversary.create({ data, include: ANNIVERSARY_INCLUDE }),
    );
    return toAnniversaryDto(row, parseIsoDay(todayInVietnam()));
  }

  async updateAnniversary(id: string, dto: UpdateAnniversaryDto) {
    const existing = await this.prisma.anniversary.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Anniversary ${id} not found`);

    const data = {
      kind: dto.kind ?? existing.kind,
      calendar: dto.calendar ?? existing.calendar,
      day: dto.day ?? existing.day,
      month: dto.month ?? existing.month,
      isLeapMonth: dto.isLeapMonth ?? existing.isLeapMonth,
      title: dto.title === undefined ? existing.title : dto.title?.trim() || null,
      description: dto.description === undefined ? existing.description : dto.description?.trim() || null,
      member_id: dto.member_id === undefined ? existing.member_id : dto.member_id,
      cemetery_id: dto.cemetery_id === undefined ? existing.cemetery_id : dto.cemetery_id,
    };
    // Đổi sang dương lịch thì cờ nhuận không còn nghĩa.
    if (data.calendar === 'SOLAR' && dto.isLeapMonth === undefined) data.isLeapMonth = false;
    await this.assertValidAnniversary(data, existing.member_id);

    const row = await this.withDeathConflict(() =>
      this.prisma.anniversary.update({ where: { id }, data, include: ANNIVERSARY_INCLUDE }),
    );
    return toAnniversaryDto(row, parseIsoDay(todayInVietnam()));
  }

  async deleteAnniversary(id: string) {
    const existing = await this.prisma.anniversary.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Anniversary ${id} not found`);
    return this.prisma.anniversary.delete({ where: { id } });
  }

  /**
   * Luật nghiệp vụ, khớp CHECK ở 009_anniversary_recurring.sql — kiểm ở đây để
   * trả 400 dễ hiểu thay vì lỗi constraint.
   */
  private async assertValidAnniversary(
    data: {
      kind: string; calendar: string; day: number; month: number; isLeapMonth: boolean;
      title: string | null; member_id: string | null;
    },
    previousMemberId?: string | null,
  ) {
    const dateError = recurringDateError(data);
    if (dateError) throw new BadRequestException(dateError);

    if (data.kind !== 'DEATH') {
      if (!data.title) throw new BadRequestException('Cần nhập tiêu đề cho ngày tưởng niệm không phải ngày kỵ');
      return;
    }
    if (!data.member_id) throw new BadRequestException('Ngày kỵ phải gắn với một thành viên');
    // Không đổi người thì không kiểm lại — tránh chặn việc sửa ngày khi trạng thái đổi sau.
    if (data.member_id === previousMemberId) return;

    const member = await this.prisma.member.findUnique({
      where: { id: data.member_id },
      select: { lifeStatus: true },
    });
    if (!member) throw new BadRequestException('Không tìm thấy thành viên');
    if (member.lifeStatus !== 'DECEASED') {
      throw new BadRequestException('Chỉ tạo ngày kỵ cho người đã mất — hãy cập nhật trạng thái thành viên trước');
    }
  }

  private async withDeathConflict<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      // anniversaries_death_member_uidx: mỗi người một ngày kỵ.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Thành viên này đã có ngày kỵ — hãy sửa ngày kỵ hiện có');
      }
      throw error;
    }
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
      include: { member: { include: { profile: EMBEDDED_PROFILE } } },
      orderBy: { created_at: 'asc' },
    });
  }

  async addAttendee(eventId: string, memberId: string, rsvpStatus = 'going') {
    await this.getEventById(eventId);
    return this.prisma.eventAttendee.upsert({
      where: { event_id_member_id: { event_id: eventId, member_id: memberId } },
      create: { event_id: eventId, member_id: memberId, rsvp_status: rsvpStatus },
      update: { rsvp_status: rsvpStatus },
      include: { member: { include: { profile: EMBEDDED_PROFILE } } },
    });
  }

  async removeAttendee(eventId: string, memberId: string) {
    await this.prisma.eventAttendee.deleteMany({
      where: { event_id: eventId, member_id: memberId },
    });
  }
}

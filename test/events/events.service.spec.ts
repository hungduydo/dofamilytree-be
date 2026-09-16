import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventsService } from '../../src/events/events.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/storage/storage.service';
import { QStashService } from '../../src/queue/qstash.service';
import { QUEUE_NOTIFICATION } from '../../src/queue/queue.constants';

const mockPrisma = {
  anniversary: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  member: {
    findUnique: jest.fn(),
  },
  event: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const mockQStashService = { publish: jest.fn() };
const mockStorage = { put: jest.fn(), del: jest.fn(), getUsage: jest.fn(), supportsPresign: jest.fn().mockReturnValue(false) };

describe('EventsService', () => {
  let service: EventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QStashService, useValue: mockQStashService },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    jest.clearAllMocks();
  });

  // ---------- Anniversary ----------
  //
  // 16/09/2026 (giờ VN) là mùng 6 tháng 8 âm lịch Bính Ngọ (Trung thu 15/8 = 25/09/2026).

  const NOW = new Date('2026-09-16T03:00:00Z');
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'ann-1', kind: 'DEATH', calendar: 'LUNAR', day: 6, month: 8, isLeapMonth: false,
    title: null, description: null, member_id: 'member-1', cemetery_id: null,
    created_at: NOW, updated_at: NOW,
    member: { id: 'member-1', name: 'Đỗ Văn A', avatar_url: null, generation: 3, deathDate: '1996' },
    cemetery: null,
    ...over,
  });

  describe('getUpcomingAnniversaries', () => {
    it('quy đổi kỵ âm lịch sang ngày dương, xếp theo ngày gần nhất', async () => {
      mockPrisma.anniversary.findMany.mockResolvedValue([
        row({ id: 'mid-autumn', day: 15 }),
        row({ id: 'today' }),
        row({ id: 'far', day: 1, month: 1 }), // Tết 2027 — ngoài 30 ngày
      ]);

      const result = await service.getUpcomingAnniversaries(30, NOW);

      expect(result.map((a) => [a.id, a.nextOccurrence, a.daysUntil])).toEqual([
        ['today', '2026-09-16', 0],
        ['mid-autumn', '2026-09-25', 9],
      ]);
      expect(result[0]).toMatchObject({ displayTitle: 'Kỵ Đỗ Văn A', yearsSinceDeath: 30 });
    });

    it('ngày đã qua trong năm nay → lần của năm sau (không biến mất như trước)', async () => {
      mockPrisma.anniversary.findMany.mockResolvedValue([row({ day: 5 })]); // hôm qua
      const [a] = await service.getAnniversaries({}, NOW);
      expect(a.daysUntil).toBeGreaterThan(300);
    });

    it('kỵ dương lịch', async () => {
      mockPrisma.anniversary.findMany.mockResolvedValue([row({ calendar: 'SOLAR', day: 20, month: 9 })]);
      const [a] = await service.getUpcomingAnniversaries(30, NOW);
      expect(a).toMatchObject({ nextOccurrence: '2026-09-20', daysUntil: 4 });
    });

    it('chỉ lấy kỵ của người vẫn đang DECEASED', async () => {
      mockPrisma.anniversary.findMany.mockResolvedValue([]);
      await service.getUpcomingAnniversaries(30, NOW);
      expect(mockPrisma.anniversary.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { AND: [{ OR: [{ kind: { not: 'DEATH' } }, { member: { lifeStatus: 'DECEASED' } }] }, {}] },
      }));
    });

    it('giới hạn cửa sổ 90 ngày', async () => {
      mockPrisma.anniversary.findMany.mockResolvedValue([row({ day: 1, month: 1 })]); // ~142 ngày
      expect(await service.getUpcomingAnniversaries(10_000, NOW)).toHaveLength(0);
    });
  });

  describe('getTodayAnniversaries', () => {
    it('dùng ngày giờ Việt Nam, kèm ngày âm hôm nay', async () => {
      mockPrisma.anniversary.findMany.mockResolvedValue([row(), row({ id: 'tomorrow', day: 7 })]);
      // 18:00 UTC = 01:00 ngày 17/09 ở Việt Nam
      const result = await service.getTodayAnniversaries(new Date('2026-09-16T18:00:00Z'));
      expect(result.date).toBe('2026-09-17');
      expect(result.lunar).toEqual({ day: 7, month: 8, year: 2026, isLeapMonth: false });
      expect(result.items.map((a) => a.id)).toEqual(['tomorrow']);
    });
  });

  describe('getAnniversaries', () => {
    it('lọc theo member, loại và tháng của chính ngày kỵ', async () => {
      mockPrisma.anniversary.findMany.mockResolvedValue([]);
      await service.getAnniversaries({ member_id: 'member-1', kind: 'DEATH', month: 3 });
      expect(mockPrisma.anniversary.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { AND: [expect.any(Object), { member_id: 'member-1', kind: 'DEATH', month: 3 }] },
      }));
    });
  });

  describe('createAnniversary', () => {
    const dto = { member_id: 'member-1', day: 23, month: 12 };

    it('mặc định là ngày kỵ âm lịch', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ lifeStatus: 'DECEASED' });
      mockPrisma.anniversary.create.mockResolvedValue(row({ day: 23, month: 12 }));
      await service.createAnniversary(dto);
      expect(mockPrisma.anniversary.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ kind: 'DEATH', calendar: 'LUNAR', day: 23, month: 12, isLeapMonth: false }),
      }));
    });

    it('từ chối người chưa ở trạng thái đã mất', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ lifeStatus: 'UNKNOWN' });
      await expect(service.createAnniversary(dto)).rejects.toThrow(BadRequestException);
    });

    it('ngày kỵ phải có member; loại khác phải có tiêu đề', async () => {
      await expect(service.createAnniversary({ day: 1, month: 1 })).rejects.toThrow(BadRequestException);
      await expect(service.createAnniversary({ kind: 'CLAN', day: 10, month: 3 })).rejects.toThrow(BadRequestException);
      mockPrisma.anniversary.create.mockResolvedValue(row({ kind: 'CLAN', title: 'Giỗ tổ', member: null, member_id: null }));
      await expect(service.createAnniversary({ kind: 'CLAN', title: 'Giỗ tổ', day: 10, month: 3 })).resolves
        .toMatchObject({ displayTitle: 'Giỗ tổ' });
    });

    it.each([
      [{ day: 31, month: 1 }],
      [{ calendar: 'SOLAR' as const, day: 31, month: 4 }],
      [{ calendar: 'SOLAR' as const, day: 5, month: 4, isLeapMonth: true }],
    ])('từ chối ngày không hợp lệ %j', async (bad) => {
      await expect(service.createAnniversary({ ...dto, ...bad })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.anniversary.create).not.toHaveBeenCalled();
    });

    it('người đã có ngày kỵ → 409', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ lifeStatus: 'DECEASED' });
      mockPrisma.anniversary.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(service.createAnniversary(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('updateAnniversary', () => {
    it('giữ các trường không gửi, không kiểm lại member khi không đổi người', async () => {
      mockPrisma.anniversary.findUnique.mockResolvedValue(row());
      mockPrisma.anniversary.update.mockResolvedValue(row({ day: 9 }));
      await service.updateAnniversary('ann-1', { day: 9 });
      expect(mockPrisma.member.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.anniversary.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ day: 9, month: 8, calendar: 'LUNAR', member_id: 'member-1' }),
      }));
    });

    it('chuyển sang dương lịch thì bỏ cờ nhuận', async () => {
      mockPrisma.anniversary.findUnique.mockResolvedValue(row({ isLeapMonth: true }));
      mockPrisma.anniversary.update.mockResolvedValue(row({ calendar: 'SOLAR' }));
      await service.updateAnniversary('ann-1', { calendar: 'SOLAR' });
      expect(mockPrisma.anniversary.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ calendar: 'SOLAR', isLeapMonth: false }),
      }));
    });

    it('404 khi không tồn tại', async () => {
      mockPrisma.anniversary.findUnique.mockResolvedValue(null);
      await expect(service.updateAnniversary('bad-id', { day: 1 })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAnniversary', () => {
    it('should throw NotFoundException when not found', async () => {
      mockPrisma.anniversary.findUnique.mockResolvedValue(null);
      await expect(service.deleteAnniversary('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should delete anniversary', async () => {
      mockPrisma.anniversary.findUnique.mockResolvedValue({ id: 'ann-1' });
      mockPrisma.anniversary.delete.mockResolvedValue({ id: 'ann-1' });
      await service.deleteAnniversary('ann-1');
      expect(mockPrisma.anniversary.delete).toHaveBeenCalledWith({ where: { id: 'ann-1' } });
    });
  });

  // ---------- Event ----------

  describe('createEvent', () => {
    it('should create event and emit notification', async () => {
      mockPrisma.event.create.mockResolvedValue({
        id: 'evt-1', title: 'Họp Mặt Dòng Họ', date: new Date('2024-08-15'), highlight: true,
      });

      const result = await service.createEvent({
        title: 'Họp Mặt Dòng Họ', date: new Date('2024-08-15'), highlight: true,
      });
      expect(result).toHaveProperty('id', 'evt-1');
      expect(mockQStashService.publish).toHaveBeenCalledWith(
        QUEUE_NOTIFICATION,
        expect.objectContaining({ type: 'NEW_EVENT' }),
      );
    });
  });

  describe('getEvents', () => {
    it('should filter by highlight=true', async () => {
      mockPrisma.event.findMany.mockResolvedValue([{ id: 'evt-1', highlight: true }]);
      await service.getEvents({ highlight: true });
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ highlight: true }) }),
      );
    });

    it('should filter by date range', async () => {
      mockPrisma.event.findMany.mockResolvedValue([]);
      await service.getEvents({ fromDate: new Date('2024-01-01'), toDate: new Date('2024-12-31') });
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ date: expect.any(Object) }) }),
      );
    });
  });

  describe('updateEvent', () => {
    it('should throw NotFoundException when event not found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);
      await expect(service.updateEvent('bad-id', { title: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('should update event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ id: 'evt-1' });
      mockPrisma.event.update.mockResolvedValue({ id: 'evt-1', title: 'Updated' });
      const result = await service.updateEvent('evt-1', { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventsService } from '../../src/events/events.service';
import { PrismaService } from '../../src/prisma/prisma.service';
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
  event: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const mockQStashService = { publish: jest.fn() };

describe('EventsService', () => {
  let service: EventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QStashService, useValue: mockQStashService },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    jest.clearAllMocks();
  });

  // ---------- Anniversary ----------

  describe('createAnniversary', () => {
    it('should create anniversary successfully', async () => {
      mockPrisma.anniversary.create.mockResolvedValue({
        id: 'ann-1', title: 'Giỗ Ông Nội', date: new Date('2024-03-15'), member_id: 'member-1',
      });

      const result = await service.createAnniversary({
        title: 'Giỗ Ông Nội', date: new Date('2024-03-15'), member_id: 'member-1',
      });
      expect(result).toHaveProperty('id', 'ann-1');
    });

    it('should create anniversary without member link (optional)', async () => {
      mockPrisma.anniversary.create.mockResolvedValue({
        id: 'ann-2', title: 'Family Anniversary', date: new Date(),
      });

      const result = await service.createAnniversary({ title: 'Family Anniversary', date: new Date() });
      expect(result.member_id).toBeUndefined();
    });
  });

  describe('getUpcomingAnniversaries', () => {
    it('should return anniversaries within the next 30 days', async () => {
      const in10Days = new Date();
      in10Days.setDate(in10Days.getDate() + 10);

      mockPrisma.anniversary.findMany.mockResolvedValue([
        { id: 'ann-1', title: 'Upcoming', date: in10Days },
      ]);

      const result = await service.getUpcomingAnniversaries();
      expect(result).toHaveLength(1);
      expect(mockPrisma.anniversary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ date: expect.any(Object) }),
        }),
      );
    });

    it('should return empty array when no upcoming anniversaries', async () => {
      mockPrisma.anniversary.findMany.mockResolvedValue([]);
      const result = await service.getUpcomingAnniversaries();
      expect(result).toHaveLength(0);
    });
  });

  describe('getAnniversaries', () => {
    it('should filter by member_id', async () => {
      mockPrisma.anniversary.findMany.mockResolvedValue([{ id: 'ann-1' }]);
      await service.getAnniversaries({ member_id: 'member-1' });
      expect(mockPrisma.anniversary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ member_id: 'member-1' }) }),
      );
    });

    it('should filter by month', async () => {
      mockPrisma.anniversary.findMany.mockResolvedValue([]);
      await service.getAnniversaries({ month: 3 });
      // month filter uses date range
      expect(mockPrisma.anniversary.findMany).toHaveBeenCalled();
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

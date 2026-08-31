import { Test, TestingModule } from '@nestjs/testing';
import { MemorialService } from '../../src/memorial/memorial.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SupabaseUsersService } from '../../src/supabase/supabase-users.service';
import {
  CACHE_KEY_MEMORIAL_STATS,
  MEMORIAL_CACHE_KEYS,
  MEMORIAL_CACHE_TTL,
  memorialAncestorsKey,
  memorialTributesKey,
} from '../../src/memorial/memorial.cache-keys';

/**
 * Bốn case chuẩn cho mỗi endpoint cached — mirror test/members/members.cache.spec.ts:
 * hit (không chạm DB) / miss (ghi cache đúng TTL) / Redis chết (không 500) /
 * invalidate sau khi ghi. Import hằng khoá & TTL thay vì hardcode chuỗi, để đổi
 * tên khoá không âm thầm làm spec vô nghĩa.
 */
const mockPrisma = {
  member: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
  memorialIncense: { create: jest.fn(), groupBy: jest.fn() },
  memorialTribute: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), deleteMany: jest.fn() },
  userMetadata: { findUnique: jest.fn() },
  $queryRaw: jest.fn(),
};
const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
const mockSupabase = { getDisplayName: jest.fn().mockResolvedValue(null) };

const CALLER = { id: 'u_1', displayName: 'Bác Tư', profileMemberId: null };

describe('MemorialService — caching', () => {
  let service: MemorialService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemorialService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SupabaseUsersService, useValue: mockSupabase },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();
    service = module.get(MemorialService);
    jest.clearAllMocks();
    mockSupabase.getDisplayName.mockResolvedValue(null);

    mockPrisma.member.findMany.mockResolvedValue([]);
    mockPrisma.member.count.mockResolvedValue(0);
    mockPrisma.member.aggregate.mockResolvedValue({ _min: { generation: 1 } });
    mockPrisma.memorialIncense.groupBy.mockResolvedValue([]);
    mockPrisma.memorialTribute.findMany.mockResolvedValue([]);
    mockPrisma.memorialTribute.count.mockResolvedValue(0);
    mockPrisma.$queryRaw.mockResolvedValue([
      { generations: 7, incense_total: 1n, tribute_total: 1n, member_count: 1n, total: 1n },
    ]);
  });

  describe('getStats', () => {
    it('hit: trả cache, KHÔNG chạm DB', async () => {
      mockRedis.get.mockResolvedValue({ generations: 7, incenseTotal: 2148, tributeTotal: 316 });
      const stats = await service.getStats();
      expect(mockRedis.get).toHaveBeenCalledWith(CACHE_KEY_MEMORIAL_STATS);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(stats.incenseTotal).toBe(2148);
    });

    it('miss: query DB rồi set cache đúng TTL', async () => {
      mockRedis.get.mockResolvedValue(null);
      await service.getStats();
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        CACHE_KEY_MEMORIAL_STATS, expect.any(String), { ex: MEMORIAL_CACHE_TTL },
      );
    });

    it('Redis chết: KHÔNG 500, rơi xuống DB', async () => {
      mockRedis.get.mockRejectedValue(new Error('Upstash down'));
      mockRedis.set.mockRejectedValue(new Error('Upstash down'));
      await expect(service.getStats()).resolves.toEqual({
        generations: 7, incenseTotal: 1, tributeTotal: 1,
      });
    });
  });

  describe('getAncestors', () => {
    it('hit trang 1: trả cache, KHÔNG chạm DB', async () => {
      mockRedis.get.mockResolvedValue({ data: [{ memberId: 'm_1' }], total: 42 });
      const result = await service.getAncestors(1, 6);
      expect(mockRedis.get).toHaveBeenCalledWith(memorialAncestorsKey(6));
      expect(mockPrisma.member.findMany).not.toHaveBeenCalled();
      // page/pageSize luôn từ request, không lấy từ cache.
      expect(result).toEqual({ data: [{ memberId: 'm_1' }], total: 42, page: 1, pageSize: 6 });
    });

    it('miss trang 1: set cache đúng khoá + TTL', async () => {
      mockRedis.get.mockResolvedValue(null);
      await service.getAncestors(1, 6);
      expect(mockRedis.set).toHaveBeenCalledWith(
        memorialAncestorsKey(6), expect.any(String), { ex: MEMORIAL_CACHE_TTL },
      );
    });

    it('trang 2 KHÔNG cache — không ai gọi tới và sẽ làm số khoá phình', async () => {
      mockRedis.get.mockResolvedValue(null);
      await service.getAncestors(2, 6);
      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe('getTributes', () => {
    it('hit trang 1 không lọc: trả cache', async () => {
      mockRedis.get.mockResolvedValue({ data: [], total: 316 });
      const result = await service.getTributes(1, 5);
      expect(mockRedis.get).toHaveBeenCalledWith(memorialTributesKey(5));
      expect(mockPrisma.memorialTribute.findMany).not.toHaveBeenCalled();
      expect(result.total).toBe(316);
    });

    it('có bộ lọc memberId thì KHÔNG cache', async () => {
      mockRedis.get.mockResolvedValue(null);
      await service.getTributes(1, 5, 'm_7');
      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe('invalidation sau mỗi lần ghi', () => {
    beforeEach(() => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.memorialIncense.create.mockResolvedValue({});
      mockPrisma.memorialTribute.create.mockResolvedValue({
        id: 't', content: 'c', created_at: new Date(), author_name: 'A',
        user_id: 'u', member_id: null, member: null,
      });
      mockPrisma.memorialTribute.deleteMany.mockResolvedValue({ count: 1 });
    });

    it.each([
      ['burnIncense', (s: MemorialService) => s.burnIncense(CALLER)],
      ['createTribute', (s: MemorialService) => s.createTribute(CALLER, 'x'.repeat(20))],
      ['deleteTribute', (s: MemorialService) => s.deleteTribute('t')],
    ])('%s xoá TOÀN BỘ khoá memorial', async (_name, call) => {
      await call(service);
      expect(mockRedis.del).toHaveBeenCalledWith(...MEMORIAL_CACHE_KEYS);
    });

    it('khoá bị xoá phủ mọi pageSize FE dùng (5 lời, 6 tổ tiên) và mặc định 20', async () => {
      await service.burnIncense(CALLER);
      const deleted: string[] = mockRedis.del.mock.calls[0];
      for (const size of [5, 6, 20]) {
        expect(deleted).toContain(memorialAncestorsKey(size));
        expect(deleted).toContain(memorialTributesKey(size));
      }
      expect(deleted).toContain(CACHE_KEY_MEMORIAL_STATS);
    });

    it('Redis chết lúc invalidate KHÔNG làm hỏng lượt thắp hương', async () => {
      mockRedis.del.mockRejectedValue(new Error('Upstash down'));
      await expect(service.burnIncense(CALLER)).resolves.toHaveProperty('incenseTotal');
    });
  });
});

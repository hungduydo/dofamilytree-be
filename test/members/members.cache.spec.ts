import { Test, TestingModule } from '@nestjs/testing';
import { MembersService } from '../../src/members/members.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QStashService } from '../../src/queue/qstash.service';
import { TasksService } from '../../src/queue/tasks.service';
import { GenerationService } from '../../src/generation/generation.service';
import {
  CACHE_KEY_MEMBERS_COMMITTEE,
  CACHE_KEY_MEMBERS_NOTABLE,
  CACHE_KEY_MEMBERS_STATS,
  MEMBERS_CACHE_TTL_LIST,
  MEMBERS_CACHE_TTL_STATS,
} from '../../src/members/members.cache-keys';
import { CONTACT_INFO_CACHE_KEYS } from '../../src/contact/contact.cache-keys';

/**
 * Cache ba endpoint public: hit (bỏ qua DB) / miss (ghi cache) / Redis chết
 * (không 500) / invalidation sau khi ghi member. Mirror test/tree/tree.service.spec.ts.
 */
const mockPrisma = {
  member: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
  profile: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  userMetadata: { deleteMany: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};
const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
const mockGeneration = { enqueueRecompute: jest.fn() };
const mockQStash = { publish: jest.fn().mockResolvedValue({}) };

describe('MembersService — caching', () => {
  let service: MembersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QStashService, useValue: mockQStash },
        { provide: TasksService, useValue: {} },
        { provide: GenerationService, useValue: mockGeneration },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();
    service = module.get<MembersService>(MembersService);
    jest.clearAllMocks();
  });

  describe('getCommitteeMembers', () => {
    it('hit: trả cache, KHÔNG chạm DB', async () => {
      mockRedis.get.mockResolvedValue([{ id: '1', name: 'A', role: '', avatar: '' }]);
      const result = await service.getCommitteeMembers();
      expect(mockRedis.get).toHaveBeenCalledWith(CACHE_KEY_MEMBERS_COMMITTEE);
      expect(mockPrisma.member.findMany).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('miss: query DB rồi set cache với TTL list', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.member.findMany.mockResolvedValue([
        { id: '1', name: 'A', avatar_url: null, profile: { occupation: 'Trưởng ban' } },
      ]);
      const result = await service.getCommitteeMembers();
      expect(mockPrisma.member.findMany).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith(
        CACHE_KEY_MEMBERS_COMMITTEE, expect.any(String), { ex: MEMBERS_CACHE_TTL_LIST },
      );
      expect(result[0]).toEqual({ id: '1', name: 'A', role: 'Trưởng ban', avatar: '' });
    });

    it('Redis chết → vẫn trả data từ DB, không throw', async () => {
      mockRedis.get.mockRejectedValue(new Error('fetch failed'));
      mockRedis.set.mockRejectedValue(new Error('fetch failed'));
      mockPrisma.member.findMany.mockResolvedValue([]);
      await expect(service.getCommitteeMembers()).resolves.toEqual([]);
    });
  });

  describe('getNotableMembers', () => {
    it('miss: set cache với key notable + TTL list', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.member.findMany.mockResolvedValue([]);
      await service.getNotableMembers();
      expect(mockRedis.set).toHaveBeenCalledWith(
        CACHE_KEY_MEMBERS_NOTABLE, expect.any(String), { ex: MEMBERS_CACHE_TTL_LIST },
      );
    });
  });

  describe('getMemberStats', () => {
    it('miss: set cache với key stats + TTL stats', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.$queryRaw.mockResolvedValue([
        { total: 1n, male: 1n, female: 0n, new_this_month: 0n, generations: 1n },
      ]);
      await service.getMemberStats();
      expect(mockRedis.set).toHaveBeenCalledWith(
        CACHE_KEY_MEMBERS_STATS, expect.any(String), { ex: MEMBERS_CACHE_TTL_STATS },
      );
    });

    it('hit: trả cache, KHÔNG chạy $queryRaw', async () => {
      mockRedis.get.mockResolvedValue({ total: 5, male: 3, female: 2, newThisMonth: 0, generations: 2 });
      const result = await service.getMemberStats();
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(result.total).toBe(5);
    });
  });

  describe('invalidation', () => {
    // Khoá contact đi kèm: `GET /contact/info` trả `board[]`, mà board CHIẾU TỪ
    // members. Không xoá chúng ở đây thì admin bật clanRole cho một người rồi mở
    // trang liên hệ sẽ không thấy gì đổi suốt một tiếng (TTL của contact).
    const expectAllKeysDeleted = () => {
      expect(mockRedis.del).toHaveBeenCalledWith(
        CACHE_KEY_MEMBERS_COMMITTEE, CACHE_KEY_MEMBERS_NOTABLE, CACHE_KEY_MEMBERS_STATS,
        ...CONTACT_INFO_CACHE_KEYS,
      );
    };

    it('createMember xoá cả khoá members lẫn khoá contact', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.create.mockResolvedValue({ id: 'm1', name: 'A' });
      mockPrisma.profile.create.mockResolvedValue({ id: 'p1' });
      await service.createMember({ fullName: 'A', gender: 'M' });
      expectAllKeysDeleted();
    });

    it('deleteMember xoá cả khoá members lẫn khoá contact', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1' });
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.profile.delete.mockResolvedValue({});
      mockPrisma.userMetadata.deleteMany.mockResolvedValue({});
      mockPrisma.member.delete.mockResolvedValue({ id: 'm1' });
      await service.deleteMember('m1');
      expectAllKeysDeleted();
    });

    it('updateMemberProfile xoá cả khoá members lẫn khoá contact', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', profile: { id: 'p1' } });
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.update.mockResolvedValue({ id: 'm1' });
      mockPrisma.profile.update.mockResolvedValue({ id: 'p1' });
      await service.updateMemberProfile('m1', { occupation: 'Kỹ sư' } as any, undefined, {
        roles: ['editor'],
        profileMemberId: null,
      });
      expectAllKeysDeleted();
    });
  });
});

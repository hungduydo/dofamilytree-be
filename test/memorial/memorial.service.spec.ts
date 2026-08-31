import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DECEASED_WHERE, MemorialService, todayInVietnam } from '../../src/memorial/memorial.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SupabaseUsersService } from '../../src/supabase/supabase-users.service';

/**
 * Luật nghiệp vụ của Góc nhớ tổ tiên. Cache có spec riêng (memorial.cache.spec.ts);
 * ở đây Redis luôn miss để mọi case đi thẳng xuống DB.
 */
const mockPrisma = {
  member: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
  memorialIncense: { create: jest.fn(), groupBy: jest.fn() },
  memorialTribute: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), deleteMany: jest.fn() },
  userMetadata: { findUnique: jest.fn() },
  $queryRaw: jest.fn(),
};
const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
const mockSupabase = { getDisplayName: jest.fn() };

const CALLER = { id: 'u_1', displayName: null, profileMemberId: null };
const DECEASED = { id: 'm_1', deathDate: '1905-01-01' };
const ALIVE = { id: 'm_2', deathDate: null };
// Dữ liệu THẬT: 12/480 member mang chuỗi rỗng thay vì null và tất cả đều còn sống.
const ALIVE_EMPTY_STRING = { id: 'm_3', deathDate: '' };

describe('MemorialService', () => {
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
    mockRedis.get.mockResolvedValue(null); // luôn miss
  });

  // ─── Chỉ dành cho người đã khuất ────────────────────────────────────────────

  describe('luật "chỉ người đã khuất"', () => {
    it.each([
      ['burnIncense', (s: MemorialService) => s.burnIncense(CALLER, 'm_x')],
      ['createTribute', (s: MemorialService) => s.createTribute(CALLER, 'x'.repeat(20), 'm_x')],
    ])('%s: memberId không tồn tại → 404', async (_name, call) => {
      mockPrisma.member.findUnique.mockResolvedValue(null);
      await expect(call(service)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.memorialIncense.create).not.toHaveBeenCalled();
      expect(mockPrisma.memorialTribute.create).not.toHaveBeenCalled();
    });

    it.each([
      ['burnIncense', (s: MemorialService) => s.burnIncense(CALLER, 'm_2')],
      ['createTribute', (s: MemorialService) => s.createTribute(CALLER, 'x'.repeat(20), 'm_2')],
    ])('%s: thành viên còn sống → 422', async (_name, call) => {
      mockPrisma.member.findUnique.mockResolvedValue(ALIVE);
      await expect(call(service)).rejects.toThrow(UnprocessableEntityException);
    });

    it.each([
      ['burnIncense', (s: MemorialService) => s.burnIncense(CALLER, 'm_3')],
      ['createTribute', (s: MemorialService) => s.createTribute(CALLER, 'x'.repeat(20), 'm_3')],
    ])('%s: deathDate là CHUỖI RỖNG cũng là còn sống → 422', async (_name, call) => {
      mockPrisma.member.findUnique.mockResolvedValue(ALIVE_EMPTY_STRING);
      await expect(call(service)).rejects.toThrow(UnprocessableEntityException);
    });

    it('deathDate toàn khoảng trắng vẫn là còn sống → 422', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'm_4', deathDate: '   ' });
      await expect(service.burnIncense(CALLER, 'm_4')).rejects.toThrow(UnprocessableEntityException);
    });

    it('không truyền memberId (gửi tổ tiên nói chung) thì KHÔNG kiểm tra member nào', async () => {
      mockPrisma.memorialIncense.create.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([{ member_count: 0n, total: 7n }]);
      await service.burnIncense(CALLER);
      expect(mockPrisma.member.findUnique).not.toHaveBeenCalled();
    });
  });

  // ─── Giới hạn mỗi ngày ──────────────────────────────────────────────────────

  describe('giới hạn 1 lượt/người/ngày', () => {
    it('P2002 từ unique index → 409, KHÔNG phải 500', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(DECEASED);
      mockPrisma.memorialIncense.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }),
      );
      await expect(service.burnIncense(CALLER, 'm_1')).rejects.toThrow(ConflictException);
    });

    it('lỗi DB khác vẫn nổi lên nguyên vẹn — không nuốt thành 409', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(DECEASED);
      mockPrisma.memorialIncense.create.mockRejectedValue(new Error('connection lost'));
      await expect(service.burnIncense(CALLER, 'm_1')).rejects.toThrow('connection lost');
    });

    it('offered_on ghi theo giờ VN, không phải UTC', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(DECEASED);
      mockPrisma.memorialIncense.create.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([{ member_count: 1n, total: 1n }]);
      await service.burnIncense(CALLER, 'm_1');
      const { offered_on } = mockPrisma.memorialIncense.create.mock.calls[0][0].data;
      expect(offered_on.toISOString().slice(0, 10)).toBe(todayInVietnam());
    });

    it('todayInVietnam: 23:30 UTC vẫn là NGÀY HÔM SAU ở VN (UTC+7)', () => {
      expect(todayInVietnam(new Date('2026-08-31T23:30:00Z'))).toBe('2026-09-01');
      expect(todayInVietnam(new Date('2026-08-31T16:59:00Z'))).toBe('2026-08-31');
    });
  });

  // ─── Đếm nén hương ──────────────────────────────────────────────────────────

  describe('incenseCount', () => {
    beforeEach(() => {
      mockPrisma.member.count.mockResolvedValue(2);
      mockPrisma.member.aggregate.mockResolvedValue({ _min: { generation: 1 } });
    });

    it('gộp MỘT groupBy cho cả trang — không phải mỗi thẻ một query', async () => {
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 'm_1', name: 'A', birthDate: null, deathDate: '1905', generation: 1, avatar_url: null },
        { id: 'm_2', name: 'B', birthDate: null, deathDate: '1930', generation: 2, avatar_url: null },
      ]);
      mockPrisma.memorialIncense.groupBy.mockResolvedValue([
        { member_id: 'm_1', _count: { _all: 428 } },
      ]);

      const { data } = await service.getAncestors(1, 20);

      expect(mockPrisma.memorialIncense.groupBy).toHaveBeenCalledTimes(1);
      expect(mockPrisma.memorialIncense.groupBy.mock.calls[0][0].where).toEqual({
        member_id: { in: ['m_1', 'm_2'] },
      });
      expect(data[0].incenseCount).toBe(428);
      expect(data[1].incenseCount).toBe(0); // không có dòng nào ⇒ 0, không undefined
    });

    it('lượt gửi tổ tiên nói chung (member_id null) KHÔNG được cộng cho ai', async () => {
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 'm_1', name: 'A', birthDate: null, deathDate: '1905', generation: 1, avatar_url: null },
      ]);
      // groupBy có thể trả về nhóm null nếu where nới lỏng — service phải lọc bỏ.
      mockPrisma.memorialIncense.groupBy.mockResolvedValue([
        { member_id: null, _count: { _all: 999 } },
        { member_id: 'm_1', _count: { _all: 3 } },
      ]);
      const { data } = await service.getAncestors(1, 20);
      expect(data[0].incenseCount).toBe(3);
    });

    it('thắp cho tổ tiên nói chung trả incenseCount = 0', async () => {
      mockPrisma.memorialIncense.create.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([{ member_count: 5n, total: 2149n }]);
      const result = await service.burnIncense(CALLER);
      expect(result).toEqual({ incenseCount: 0, incenseTotal: 2149 });
    });
  });

  // ─── isFounder ──────────────────────────────────────────────────────────────

  describe('isFounder', () => {
    beforeEach(() => {
      mockPrisma.member.count.mockResolvedValue(2);
      mockPrisma.memorialIncense.groupBy.mockResolvedValue([]);
    });

    it('là thế hệ THẤP NHẤT đang có, không hardcode 1', async () => {
      mockPrisma.member.aggregate.mockResolvedValue({ _min: { generation: 3 } });
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 'a', name: 'A', birthDate: null, deathDate: '1', generation: 3, avatar_url: null },
        { id: 'b', name: 'B', birthDate: null, deathDate: '2', generation: 4, avatar_url: null },
      ]);
      const { data } = await service.getAncestors(1, 20);
      expect(data.map((d) => d.isFounder)).toEqual([true, false]);
    });

    it('generation null KHÔNG bao giờ là thủy tổ', async () => {
      mockPrisma.member.aggregate.mockResolvedValue({ _min: { generation: null } });
      mockPrisma.member.findMany.mockResolvedValue([
        { id: 'a', name: 'A', birthDate: null, deathDate: '1', generation: null, avatar_url: null },
      ]);
      const { data } = await service.getAncestors(1, 20);
      expect(data[0].isFounder).toBe(false);
    });
  });

  // ─── Phân trang & projection ────────────────────────────────────────────────

  describe('phân trang', () => {
    beforeEach(() => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);
      mockPrisma.member.aggregate.mockResolvedValue({ _min: { generation: 1 } });
      mockPrisma.memorialIncense.groupBy.mockResolvedValue([]);
    });

    it('pageSize bị kẹp ở 100', async () => {
      const result = await service.getAncestors(1, 5000);
      expect(mockPrisma.member.findMany.mock.calls[0][0].take).toBe(100);
      expect(result.pageSize).toBe(100);
    });

    it('lọc đúng "đã khuất thật" và sắp xếp generation NULLS LAST', async () => {
      await service.getAncestors(2, 6);
      const args = mockPrisma.member.findMany.mock.calls[0][0];
      // Phải loại CẢ null LẪN chuỗi rỗng, khớp mệnh đề WHERE của
      // members_deceased_order_idx — lệch là mất index.
      expect(args.where).toEqual(DECEASED_WHERE);
      expect(args.where).toEqual({
        AND: [{ deathDate: { not: null } }, { deathDate: { not: '' } }],
      });
      expect(args.skip).toBe(6);
      expect(args.orderBy[0]).toEqual({ generation: { sort: 'asc', nulls: 'last' } });
      // `id` cuối cùng để phân trang ổn định.
      expect(args.orderBy[args.orderBy.length - 1]).toEqual({ id: 'asc' });
    });

    it('projection KHÔNG kéo profile (chứa PII) — đây là endpoint public', async () => {
      await service.getAncestors(1, 6);
      const { select } = mockPrisma.member.findMany.mock.calls[0][0];
      expect(select).not.toHaveProperty('profile');
      expect(Object.keys(select).sort()).toEqual(
        ['avatar_url', 'birthDate', 'deathDate', 'generation', 'id', 'name'].sort(),
      );
    });
  });

  // ─── authorName ─────────────────────────────────────────────────────────────

  describe('resolveAuthorName', () => {
    const tributeRow = {
      id: 't1', content: 'c', created_at: new Date('2026-08-31T02:10:00Z'),
      author_name: '', user_id: 'u_1', member_id: null, member: null,
    };
    const createWith = async (caller: any) => {
      mockPrisma.memorialTribute.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...tributeRow, author_name: data.author_name }),
      );
      return service.createTribute(caller, 'x'.repeat(20));
    };

    it('1. ưu tiên tên thành viên gia phả đã liên kết', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ name: 'Nguyễn Minh Đức' });
      const r = await createWith({ id: 'u_1', displayName: 'nickname', profileMemberId: 'm_9' });
      expect(r.authorName).toBe('Nguyễn Minh Đức');
      expect(mockSupabase.getDisplayName).not.toHaveBeenCalled();
    });

    it('2. rơi xuống displayName trên JWT — không hỏi Supabase', async () => {
      const r = await createWith({ id: 'u_1', displayName: '  Bác Tư  ', profileMemberId: null });
      expect(r.authorName).toBe('Bác Tư');
      expect(mockSupabase.getDisplayName).not.toHaveBeenCalled();
    });

    it('3. rơi xuống Supabase khi hai nguồn trên đều rỗng', async () => {
      mockSupabase.getDisplayName.mockResolvedValue('Tên trên Supabase');
      const r = await createWith(CALLER);
      expect(r.authorName).toBe('Tên trên Supabase');
    });

    it('4. token cũ: tra lại profile_member từ user_metadata', async () => {
      mockSupabase.getDisplayName.mockResolvedValue(null);
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ profile_member: { name: 'Cụ Cả' } });
      const r = await createWith(CALLER);
      expect(r.authorName).toBe('Cụ Cả');
    });

    it('5. hết nguồn → hằng ẩn danh, KHÔNG BAO GIỜ là email', async () => {
      mockSupabase.getDisplayName.mockResolvedValue(null);
      mockPrisma.userMetadata.findUnique.mockResolvedValue(null);
      const r = await createWith({ id: 'u_1', email: 'bimat@example.com' } as any);
      expect(r.authorName).toBe('Thành viên dòng họ');
      expect(r.authorName).not.toMatch(/@|bimat/);
    });

    it('email KHÔNG rò ra kể cả dạng local-part khi mọi nguồn khác rỗng', async () => {
      mockSupabase.getDisplayName.mockResolvedValue(null);
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ profile_member: null });
      const r = await createWith({
        id: 'u_1', email: 'nguyenvana@gmail.com', displayName: '   ', profileMemberId: null,
      } as any);
      expect(JSON.stringify(r)).not.toContain('nguyenvana');
    });
  });

  // ─── Lời tưởng niệm ─────────────────────────────────────────────────────────

  describe('tributes', () => {
    it('map snake_case → camelCase đúng hợp đồng của FE', async () => {
      mockPrisma.memorialTribute.findMany.mockResolvedValue([{
        id: 't1', content: 'Kính cẩn', created_at: new Date('2026-08-31T02:10:00.000Z'),
        author_name: 'Đức', user_id: 'u_123', member_id: 'm_1', member: { name: 'Cụ Thủy' },
      }]);
      mockPrisma.memorialTribute.count.mockResolvedValue(1);

      const { data } = await service.getTributes(1, 20);
      expect(data[0]).toEqual({
        id: 't1', content: 'Kính cẩn', createdAt: '2026-08-31T02:10:00.000Z',
        authorName: 'Đức', authorUserId: 'u_123', memberId: 'm_1', memberName: 'Cụ Thủy',
      });
    });

    it('lời gửi tổ tiên nói chung có memberId/memberName = null', async () => {
      mockPrisma.memorialTribute.findMany.mockResolvedValue([{
        id: 't2', content: 'c', created_at: new Date(), author_name: 'A',
        user_id: 'u', member_id: null, member: null,
      }]);
      mockPrisma.memorialTribute.count.mockResolvedValue(1);
      const { data } = await service.getTributes(1, 20);
      expect(data[0].memberId).toBeNull();
      expect(data[0].memberName).toBeNull();
    });

    it('lọc theo memberId', async () => {
      mockPrisma.memorialTribute.findMany.mockResolvedValue([]);
      mockPrisma.memorialTribute.count.mockResolvedValue(0);
      await service.getTributes(1, 20, 'm_7');
      expect(mockPrisma.memorialTribute.findMany.mock.calls[0][0].where).toEqual({ member_id: 'm_7' });
    });

    it('xoá lời đã biến mất → 404, không phải 500', async () => {
      mockPrisma.memorialTribute.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.deleteTribute('t_gone')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── stats ──────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('MỘT round-trip, và BigInt được ép về number', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { generations: 7, incense_total: 2148n, tribute_total: 316n },
      ]);
      const stats = await service.getStats();
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(stats).toEqual({ generations: 7, incenseTotal: 2148, tributeTotal: 316 });
      // BigInt lọt ra sẽ làm JSON.stringify ném ở tầng response.
      expect(() => JSON.stringify(stats)).not.toThrow();
    });

    it('bảng rỗng → ba số 0, không phải null', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      expect(await service.getStats()).toEqual({ generations: 0, incenseTotal: 0, tributeTotal: 0 });
    });
  });
});

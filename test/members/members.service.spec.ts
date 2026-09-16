import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { MembersService } from '../../src/members/members.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QStashService } from '../../src/queue/qstash.service';
import { TasksService } from '../../src/queue/tasks.service';
import { GenerationService } from '../../src/generation/generation.service';
import { QUEUE_REPORT_GENERATE, QUEUE_NOTIFICATION } from '../../src/queue/queue.constants';
import { MEMBER_LITE_SELECT } from '../../src/members/members.select';

const mockPrisma = {
  member: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  profile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  userMetadata: {
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
};

const mockQStashService = { publish: jest.fn().mockResolvedValue({}) };
const mockTasksService = { handleAvatarUpload: jest.fn().mockResolvedValue(undefined) };
const mockGenerationService = { enqueueRecompute: jest.fn(), recomputeAll: jest.fn() };
const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

/** Người gọi mặc định cho các test updateMemberProfile: editor ⇒ sửa được mọi
 *  hồ sơ, mọi field. Ràng buộc "chính chủ" có spec riêng (members.self-edit). */
const EDITOR_CALLER = { roles: ['editor'], profileMemberId: null };

describe('MembersService', () => {
  let service: MembersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QStashService, useValue: mockQStashService },
        { provide: TasksService, useValue: mockTasksService },
        { provide: GenerationService, useValue: mockGenerationService },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<MembersService>(MembersService);
    jest.clearAllMocks();
  });

  describe('createMember', () => {
    it('should create member + profile successfully', async () => {
      const dto = { fullName: 'Nguyễn Văn A', gender: 'M', birthDate: '1990-01-01' };
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.create.mockResolvedValue({ id: 'uuid-1', name: 'Nguyễn Văn A', gender: 'M' });
      mockPrisma.profile.create.mockResolvedValue({ id: 'p-1', fullName: 'Nguyễn Văn A' });

      const result = await service.createMember(dto);
      expect(result).toHaveProperty('id', 'uuid-1');
      expect(mockPrisma.member.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Nguyễn Văn A' }) }),
      );
    });

    it('should throw BadRequestException when name is missing', async () => {
      await expect(service.createMember({ fullName: '', gender: 'M' })).rejects.toThrow(BadRequestException);
    });

    describe('lifeStatus', () => {
      beforeEach(() => {
        mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
        mockPrisma.member.create.mockResolvedValue({ id: 'uuid-1' });
        mockPrisma.profile.create.mockResolvedValue({ id: 'p-1' });
      });
      const createdStatus = () => mockPrisma.member.create.mock.calls[0][0].data.lifeStatus;

      it.each([
        ['không có gì → UNKNOWN (không tự suy ALIVE)', { birthDate: '1990-01-01' }, 'UNKNOWN'],
        ['deathDate rỗng → UNKNOWN', { deathDate: '' }, 'UNKNOWN'],
        ['có deathDate thật → DECEASED', { deathDate: '2001-02-03' }, 'DECEASED'],
        ['sinh quá 110 năm → DECEASED', { birthDate: '1800' }, 'DECEASED'],
        ['truyền tường minh ALIVE → ALIVE', { lifeStatus: 'ALIVE' }, 'ALIVE'],
        ['DECEASED không có ngày mất → DECEASED', { lifeStatus: 'DECEASED' }, 'DECEASED'],
      ])('%s', async (_name, patch, expected) => {
        await service.createMember({ fullName: 'Nguyễn Văn A', gender: 'M', ...patch } as any);
        expect(createdStatus()).toBe(expected);
      });

      it('ALIVE kèm deathDate thật → 400', async () => {
        await expect(
          service.createMember({ fullName: 'A', gender: 'M', deathDate: '2001', lifeStatus: 'ALIVE' } as any),
        ).rejects.toThrow(BadRequestException);
        expect(mockPrisma.member.create).not.toHaveBeenCalled();
      });
    });

    it('should queue notification after create', async () => {
      const dto = { fullName: 'Test Member', gender: 'F' };
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.create.mockResolvedValue({ id: 'uuid-2', name: 'Test Member' });
      mockPrisma.profile.create.mockResolvedValue({ id: 'p-2', fullName: 'Test Member' });

      await service.createMember(dto);
      expect(mockQStashService.publish).toHaveBeenCalledWith(
        QUEUE_NOTIFICATION,
        expect.objectContaining({ type: 'NEW_MEMBER' }),
      );
    });

    it('should queue report regeneration after create', async () => {
      const dto = { fullName: 'New Member', gender: 'M' };
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.create.mockResolvedValue({ id: 'uuid-3', name: 'New Member' });
      mockPrisma.profile.create.mockResolvedValue({ id: 'p-3', fullName: 'New Member' });

      await service.createMember(dto);
      expect(mockQStashService.publish).toHaveBeenCalledWith(QUEUE_REPORT_GENERATE, {});
    });
  });

  describe('getMemberById', () => {
    it('should return member with profile when found', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({
        id: 'uuid-1',
        name: 'Test',
        profile: { fullName: 'Test', generation: 3 },
      });

      const result = await service.getMemberById('uuid-1');
      expect(result).toHaveProperty('id', 'uuid-1');
    });

    it('should throw NotFoundException when member not found', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(null);
      await expect(service.getMemberById('not-exist')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAllMembers', () => {
    it('should return paginated list', async () => {
      mockPrisma.member.findMany.mockResolvedValue([{ id: '1', name: 'A' }, { id: '2', name: 'B' }]);
      mockPrisma.member.count.mockResolvedValue(2);

      const result = await service.getAllMembers(1, 10);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should use default page=1 pageSize=10', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);

      await service.getAllMembers(undefined, undefined);
      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('suy skip từ take ĐÃ cap, không phải từ pageSize thô', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);

      // Regression: trước đây skip = (2-1)*1000 = 1000 trong khi take cap ở 100,
      // nên trang 2 trả về dòng 1001–1100 thay vì 101–200.
      await service.getAllMembers(2, 1000);
      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 100, take: 100 }),
      );
    });

    it('clamp page/pageSize ≥ 1 để không sinh NaN hay skip âm', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);

      await service.getAllMembers(0, 0);
      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 1 }),
      );
    });

    it('lọc theo generation trên cột hiệu lực của member', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);

      await service.getAllMembers(1, 10, undefined, 3);
      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [{ generation: 3 }] } }),
      );
    });

    it('sắp xếp theo generation với nulls last + khoá phụ ổn định', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);

      await service.getAllMembers(1, 10, undefined, undefined, 'generation', 'asc');
      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ generation: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        }),
      );
    });

    it('bỏ qua sortBy không nằm trong allowlist, quay về created_at', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);

      await service.getAllMembers(1, 10, undefined, undefined, 'id; DROP TABLE members' as any);
      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ created_at: 'desc' }, { id: 'asc' }] }),
      );
    });
  });

  describe('getAllMembers — bộ lọc', () => {
    beforeEach(() => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);
    });
    const whereArg = () => mockPrisma.member.findMany.mock.calls[0][0].where;
    const call = (filters: object, name?: string) =>
      service.getAllMembers(1, 10, name, undefined, 'created_at', 'desc', 'table', undefined, undefined, false, filters);

    it('không có bộ lọc nào → where rỗng', async () => {
      await call({});
      expect(whereArg()).toEqual({});
    });

    it('tên + thiếu dữ liệu cùng lúc: cả hai OR đều giữ lại (AND, không spread)', async () => {
      await call({ missing: ['birthDate', 'avatar'] }, 'nguyen');
      const { AND } = whereArg();
      expect(AND).toHaveLength(3);
      expect(AND[1]).toEqual({ OR: [{ birthDate: null }, { birthDate: '' }] });
      expect(AND[2]).toEqual({ OR: [{ avatar_url: null }, { avatar_url: '' }] });
    });

    it('missing=parents bỏ qua cạnh SPOUSE', async () => {
      await call({ missing: ['parents'] });
      expect(whereArg().AND[0]).toEqual({ child_relationships: { none: { type: { not: 'SPOUSE' } } } });
    });

    it('missing=deathDate chỉ tính người đã mất', async () => {
      await call({ missing: ['deathDate'] });
      expect(whereArg().AND[0]).toEqual({
        AND: [{ lifeStatus: 'DECEASED' }, { OR: [{ deathDate: null }, { deathDate: '' }] }],
      });
    });

    it('missing=deathAnniversary: người đã mất chưa có ngày kỵ', async () => {
      await call({ missing: ['deathAnniversary'] });
      expect(whereArg().AND[0]).toEqual({
        lifeStatus: 'DECEASED', anniversaries: { none: { kind: 'DEATH' } },
      });
    });

    it('khoảng năm sinh: lấy id từ query phụ rồi lọc id IN', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      await call({ birthYearFrom: 1900 });
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      // Tham số bind: from = 1900, to mặc định = trần.
      expect(mockPrisma.$queryRaw.mock.calls[0].slice(1)).toEqual([1900, 2200]);
      expect(whereArg()).toEqual({ AND: [{ id: { in: ['a', 'b'] } }] });
      // count phải dùng CÙNG where, nếu không total lệch với data.
      expect(mockPrisma.member.count.mock.calls[0][0].where).toEqual(whereArg());
    });

    it('không lọc năm sinh thì KHÔNG chạy query phụ', async () => {
      await call({ lifeStatus: 'ALIVE' });
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(whereArg()).toEqual({ AND: [{ lifeStatus: 'ALIVE' }] });
    });
  });

  describe('searchMembers', () => {
    it('should search by normalized name (Vietnamese-insensitive)', async () => {
      mockPrisma.member.findMany.mockResolvedValue([{ id: '1', name: 'Nguyễn Văn A' }]);

      const result = await service.searchMembers('nguyen van a');
      const arg = mockPrisma.member.findMany.mock.calls[0][0];
      expect(arg).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                normalized_name: expect.objectContaining({ contains: 'nguyen van a' }),
              }),
              expect.objectContaining({
                name: expect.objectContaining({ contains: 'nguyen van a' }),
              }),
            ]),
          }),
          // Chỉ trả MemberLiteDto (id/name/avatar/generation) — không include.
          select: MEMBER_LITE_SELECT,
          take: 50,
        }),
      );
      expect(arg).not.toHaveProperty('include');
      expect(result).toHaveLength(1);
    });
  });

  describe('updateMemberProfile', () => {
    it('should update member and profile', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'uuid-1', profile: { id: 'p-1' } });
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.update.mockResolvedValue({ id: 'uuid-1', name: 'Updated' });
      mockPrisma.profile.update.mockResolvedValue({ id: 'p-1', fullName: 'Updated' });

      const result = await service.updateMemberProfile('uuid-1', { fullName: 'Updated', gender: 'M' }, undefined, EDITOR_CALLER);
      expect(result).toHaveProperty('id', 'uuid-1');
    });

    describe('lifeStatus', () => {
      const existing = (patch: object) =>
        mockPrisma.member.findUnique.mockResolvedValue({
          id: 'uuid-1', profile: { id: 'p-1' }, deathDate: null, lifeStatus: 'UNKNOWN', ...patch,
        });
      beforeEach(() => {
        mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
        mockPrisma.member.update.mockResolvedValue({ id: 'uuid-1' });
        mockPrisma.profile.update.mockResolvedValue({ id: 'p-1' });
      });
      const updatedData = () => mockPrisma.member.update.mock.calls[0][0].data;

      it('không nhắc tới lifeStatus/deathDate → không đụng cột', async () => {
        existing({});
        await service.updateMemberProfile('uuid-1', { occupation: 'X' } as any, undefined, EDITOR_CALLER);
        expect(updatedData()).not.toHaveProperty('lifeStatus');
      });

      it('thêm deathDate thật → ép DECEASED', async () => {
        existing({ lifeStatus: 'UNKNOWN' });
        await service.updateMemberProfile('uuid-1', { deathDate: '2010-05-05' } as any, undefined, EDITOR_CALLER);
        expect(updatedData().lifeStatus).toBe('DECEASED');
      });

      it('xoá deathDate KHÔNG tự chuyển về còn sống', async () => {
        existing({ deathDate: '2010', lifeStatus: 'DECEASED' });
        await service.updateMemberProfile('uuid-1', { deathDate: '' } as any, undefined, EDITOR_CALLER);
        expect(updatedData().lifeStatus).toBe('DECEASED');
      });

      it('đặt ALIVE khi member đang có deathDate thật → 400', async () => {
        existing({ deathDate: '2010', lifeStatus: 'DECEASED' });
        await expect(
          service.updateMemberProfile('uuid-1', { lifeStatus: 'ALIVE' } as any, undefined, EDITOR_CALLER),
        ).rejects.toThrow(BadRequestException);
        expect(mockPrisma.member.update).not.toHaveBeenCalled();
      });

      it('xoá deathDate và đặt ALIVE cùng lúc → được', async () => {
        existing({ deathDate: '2010', lifeStatus: 'DECEASED' });
        await service.updateMemberProfile('uuid-1', { deathDate: '', lifeStatus: 'ALIVE' } as any, undefined, EDITOR_CALLER);
        expect(updatedData().lifeStatus).toBe('ALIVE');
      });

      it('xoá cache tree:stats, tree:chart:full và memorial sau khi ghi', async () => {
        existing({});
        await service.updateMemberProfile('uuid-1', { lifeStatus: 'DECEASED' } as any, undefined, EDITOR_CALLER);
        const deletedKeys = mockRedis.del.mock.calls.flat();
        expect(deletedKeys).toEqual(expect.arrayContaining(['tree:stats', 'tree:chart:full', 'memorial:stats']));
      });
    });

    it('should throw NotFoundException when member not found', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(null);
      await expect(service.updateMemberProfile('bad-id', { fullName: 'X', gender: 'M' }, undefined, EDITOR_CALLER)).rejects.toThrow(NotFoundException);
    });

    it('should upload the avatar directly when a file is provided', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'uuid-1', profile: { id: 'p-1' } });
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.update.mockResolvedValue({ id: 'uuid-1' });
      mockPrisma.profile.update.mockResolvedValue({ id: 'p-1' });

      const mockFile = { buffer: Buffer.from('img'), originalname: 'avatar.jpg', mimetype: 'image/jpeg' } as Express.Multer.File;
      await service.updateMemberProfile('uuid-1', { fullName: 'X', gender: 'M' }, mockFile, EDITOR_CALLER);
      // Called directly (not via QStash) — the callback webhook needs a publicly
      // reachable APP_URL, which local dev doesn't have.
      expect(mockTasksService.handleAvatarUpload).toHaveBeenCalledWith(
        expect.objectContaining({ memberId: 'uuid-1' }),
      );
    });

    it('mirror generation nhập tay sang member và xếp hàng tính lại', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'uuid-1', profile: { id: 'p-1' } });
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.update.mockResolvedValue({ id: 'uuid-1' });
      mockPrisma.profile.update.mockResolvedValue({ id: 'p-1' });

      await service.updateMemberProfile('uuid-1', { generation: 4 } as any, undefined, EDITOR_CALLER);
      expect(mockPrisma.member.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ generation: 4 }) }),
      );
      // Pin lan xuống toàn bộ hậu duệ nên phải tính lại cả cây.
      expect(mockGenerationService.enqueueRecompute).toHaveBeenCalled();
    });

    it('KHÔNG xếp hàng khi generation không đổi', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'uuid-1', profile: { id: 'p-1' } });
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.update.mockResolvedValue({ id: 'uuid-1' });
      mockPrisma.profile.update.mockResolvedValue({ id: 'p-1' });

      await service.updateMemberProfile('uuid-1', { occupation: 'Kỹ sư' } as any, undefined, EDITOR_CALLER);
      expect(mockGenerationService.enqueueRecompute).not.toHaveBeenCalled();
    });
  });

  describe('deleteMember', () => {
    it('should cascade delete profile and userMetadata before member and queue report', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'uuid-1' });
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.profile.delete.mockResolvedValue({});
      mockPrisma.userMetadata.deleteMany.mockResolvedValue({});
      mockPrisma.member.delete.mockResolvedValue({ id: 'uuid-1' });

      await service.deleteMember('uuid-1');
      expect(mockPrisma.member.delete).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
      expect(mockQStashService.publish).toHaveBeenCalledWith(QUEUE_REPORT_GENERATE, {});
      // Xoá member có thể cắt rời cả một nhánh khỏi gốc.
      expect(mockGenerationService.enqueueRecompute).toHaveBeenCalled();
    });

    it('should throw NotFoundException when member not found', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(null);
      await expect(service.deleteMember('bad-id')).rejects.toThrow(NotFoundException);
      expect(mockGenerationService.enqueueRecompute).not.toHaveBeenCalled();
    });
  });

  describe('getMemberStats', () => {
    it('gộp 5 count thành 1 $queryRaw và ép BigInt về number', async () => {
      // COUNT của Postgres là int8 → Prisma trả BigInt.
      mockPrisma.$queryRaw.mockResolvedValue([
        { total: 1256n, male: 648n, female: 608n, new_this_month: 28n, generations: 6n },
      ]);

      const result = await service.getMemberStats();

      // MỘT lượt quét, không còn findMany({ distinct }).
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.member.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        total: 1256, male: 648, female: 608, newThisMonth: 28, generations: 6,
      });
      // Mọi field phải là number (nếu còn BigInt thì JSON.stringify sẽ 500).
      for (const v of Object.values(result)) expect(typeof v).toBe('number');
    });
  });

  describe('recomputeGenerations', () => {
    // Kiểm tra admin đã chuyển lên @Roles('admin') ở controller — RolesGuard đọc
    // role từ DB y hệt đoạn code cũ trong service. Việc route này CÒN yêu cầu
    // admin được khoá bởi test/auth/route-roles.spec.ts.
    it('uỷ quyền thẳng cho GenerationService', async () => {
      mockGenerationService.recomputeAll.mockResolvedValue({ members: 3, updated: 3 });

      const result = await service.recomputeGenerations();
      expect(result).toMatchObject({ members: 3, updated: 3 });
    });
  });
});

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MembersService, NOTABLE_MEMBERS_LIMIT } from '../../src/members/members.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QStashService } from '../../src/queue/qstash.service';
import { TasksService } from '../../src/queue/tasks.service';
import { GenerationService } from '../../src/generation/generation.service';
import { CACHE_KEY_MEMBERS_NOTABLE } from '../../src/members/members.cache-keys';
import { UpdateMemberDto } from '../../src/members/dto/update-member.dto';
import { NOTABLE_SUMMARY_MAX_LENGTH } from '../../src/members/dto/create-member.dto';
import { withAuditTx } from '../helpers/audit-tx';

/**
 * `GET /members/notable` là endpoint PUBLIC. Trước đây nó trả 9 người đầu tiên
 * có biography khác rỗng, kèm NGUYÊN biography — dữ liệu thật có địa chỉ nhà của
 * người có thể còn sống. Spec này khoá hai điều: chỉ người được CHỌN TƯỜNG MINH
 * (isNotable), và biography không bao giờ được đọc.
 */
const mockPrisma = withAuditTx({
  member: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  profile: { create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
});
const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

describe('MembersService — người tiêu biểu', () => {
  let service: MembersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QStashService, useValue: { publish: jest.fn().mockResolvedValue({}) } },
        { provide: TasksService, useValue: {} },
        { provide: GenerationService, useValue: { enqueueRecompute: jest.fn() } },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();
    service = module.get<MembersService>(MembersService);
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  });

  describe('getNotableMembers', () => {
    it('chỉ lọc theo isNotable — KHÔNG theo biography', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      await service.getNotableMembers();
      const args = mockPrisma.member.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ profile: { isNotable: true } });
      expect(JSON.stringify(args.where)).not.toContain('biography');
    });

    it('KHÔNG select biography hay bất kỳ cột liên lạc nào', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      await service.getNotableMembers();
      const { select } = mockPrisma.member.findMany.mock.calls[0][0];
      expect(select).toEqual({
        id: true,
        name: true,
        avatar_url: true,
        profile: { select: { notableSummary: true } },
      });
    });

    it('có trần số dòng', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      await service.getNotableMembers();
      expect(mockPrisma.member.findMany.mock.calls[0][0].take).toBe(NOTABLE_MEMBERS_LIMIT);
    });

    it('description = notableSummary (trim); thiếu ⇒ chuỗi rỗng; shape giữ nguyên', async () => {
      mockPrisma.member.findMany.mockResolvedValue([
        { id: '1', name: 'Cụ A', avatar_url: 'https://x/a.jpg', profile: { notableSummary: '  Nhà giáo  ' } },
        { id: '2', name: 'Ông B', avatar_url: null, profile: { notableSummary: null } },
      ]);
      const result = await service.getNotableMembers();
      expect(result).toEqual([
        { id: '1', name: 'Cụ A', description: 'Nhà giáo', avatar: 'https://x/a.jpg' },
        { id: '2', name: 'Ông B', description: '', avatar: '' },
      ]);
      expect(mockRedis.set).toHaveBeenCalledWith(CACHE_KEY_MEMBERS_NOTABLE, expect.any(String), expect.anything());
    });

    // Lưới an toàn: dù mock trả thêm cột (vd. ai đó lỡ đổi select), output
    // public chỉ có đúng 4 field.
    it('output không bao giờ mang biography/địa chỉ dù DB trả thừa', async () => {
      mockPrisma.member.findMany.mockResolvedValue([
        {
          id: '1', name: 'Cụ A', avatar_url: null,
          profile: { notableSummary: 'Tóm tắt', biography: 'Nhà ở số 1 phố X', address: 'số 1 phố X' },
        },
      ]);
      const [row] = await service.getNotableMembers();
      expect(Object.keys(row).sort()).toEqual(['avatar', 'description', 'id', 'name']);
      expect(JSON.stringify(row)).not.toContain('phố X');
    });
  });

  describe('ghi isNotable / notableSummary (editor)', () => {
    const editor = { roles: ['editor'], profileMemberId: null };

    beforeEach(() => {
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', lifeStatus: 'UNKNOWN', profile: { id: 'p1' } });
      mockPrisma.member.update.mockResolvedValue({ id: 'm1', name: 'A' });
      mockPrisma.profile.update.mockResolvedValue({});
    });

    it('update ghi cả hai cột và xoá cache notable', async () => {
      await service.updateMemberProfile('m1', { isNotable: true, notableSummary: ' Nhà giáo ' } as any, undefined, editor);
      expect(mockPrisma.profile.update).toHaveBeenCalledWith({
        where: { member_id: 'm1' },
        data: { isNotable: true, notableSummary: 'Nhà giáo' },
      });
      expect(mockRedis.del.mock.calls[0]).toContain(CACHE_KEY_MEMBERS_NOTABLE);
    });

    it('notableSummary rỗng ⇒ lưu NULL', async () => {
      await service.updateMemberProfile('m1', { notableSummary: '   ' } as any, undefined, editor);
      expect(mockPrisma.profile.update.mock.calls[0][0].data).toEqual({ notableSummary: null });
    });

    it('create mặc định isNotable=false', async () => {
      mockPrisma.member.create.mockResolvedValue({ id: 'm2', name: 'B' });
      mockPrisma.profile.create.mockResolvedValue({});
      await service.createMember({ fullName: 'Nguyễn B' } as any);
      expect(mockPrisma.profile.create.mock.calls[0][0].data).toMatchObject({ isNotable: false, notableSummary: undefined });
    });
  });

  describe('UpdateMemberDto', () => {
    const check = async (body: Record<string, unknown>) =>
      validate(plainToInstance(UpdateMemberDto, body), { whitelist: true });

    it.each([['true', true], ['false', false], [true, true], ['1', true], ['0', false]])(
      'isNotable %p (multipart/JSON) ⇒ %p', async (raw, expected) => {
        const dto = plainToInstance(UpdateMemberDto, { isNotable: raw });
        expect(dto.isNotable).toBe(expected);
        expect(await validate(dto)).toHaveLength(0);
      },
    );

    it('isNotable lạ ⇒ lỗi validate', async () => {
      expect(await check({ isNotable: 'yes' })).not.toHaveLength(0);
    });

    it(`notableSummary dài hơn ${NOTABLE_SUMMARY_MAX_LENGTH} ⇒ lỗi validate`, async () => {
      expect(await check({ notableSummary: 'a'.repeat(NOTABLE_SUMMARY_MAX_LENGTH + 1) })).not.toHaveLength(0);
      expect(await check({ notableSummary: 'a'.repeat(NOTABLE_SUMMARY_MAX_LENGTH) })).toHaveLength(0);
    });
  });
});

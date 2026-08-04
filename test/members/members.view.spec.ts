import { Test, TestingModule } from '@nestjs/testing';
import { MembersService } from '../../src/members/members.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QStashService } from '../../src/queue/qstash.service';
import { TasksService } from '../../src/queue/tasks.service';
import { GenerationService } from '../../src/generation/generation.service';
import {
  MEMBER_LITE_SELECT,
  MEMBER_TABLE_SELECT,
  TREE_BRIEF_SELECT,
} from '../../src/members/members.select';

/**
 * Hợp đồng của `?view=` trên GET /v2/members + việc thu hẹp `tree` ở các endpoint
 * chi tiết. Assert shape của arg truyền vào Prisma, không cần DB thật.
 */
const mockPrisma = {
  member: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  $queryRaw: jest.fn(),
};
const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

describe('MembersService — view/select shape', () => {
  let service: MembersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QStashService, useValue: { publish: jest.fn() } },
        { provide: TasksService, useValue: {} },
        { provide: GenerationService, useValue: { enqueueRecompute: jest.fn() } },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();
    service = module.get<MembersService>(MembersService);
    jest.clearAllMocks();
    mockPrisma.member.findMany.mockResolvedValue([]);
    mockPrisma.member.count.mockResolvedValue(0);
    mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1' });
  });

  const listArg = () => mockPrisma.member.findMany.mock.calls[0][0];

  describe('getAllMembers', () => {
    it("view='lite' → select MEMBER_LITE_SELECT, KHÔNG có include", async () => {
      await service.getAllMembers(1, 10, undefined, undefined, 'created_at', 'desc', 'lite');
      expect(listArg().select).toEqual(MEMBER_LITE_SELECT);
      expect(listArg()).not.toHaveProperty('include');
    });

    it("view='table' → select MEMBER_TABLE_SELECT, bỏ biography/notes", async () => {
      await service.getAllMembers(1, 10, undefined, undefined, 'created_at', 'desc', 'table');
      expect(listArg().select).toEqual(MEMBER_TABLE_SELECT);
      expect(listArg()).not.toHaveProperty('include');
      // Hợp đồng giảm payload: bảng KHÔNG kéo hai cột free-text nặng nhất.
      expect(MEMBER_TABLE_SELECT.profile.select).not.toHaveProperty('biography');
      expect(MEMBER_TABLE_SELECT.profile.select).not.toHaveProperty('notes');
    });

    it("view='full' → include profile + tree brief, KHÔNG có select", async () => {
      await service.getAllMembers(1, 10, undefined, undefined, 'created_at', 'desc', 'full');
      expect(listArg()).not.toHaveProperty('select');
      expect(listArg().include).toEqual({
        profile: true,
        tree: { select: TREE_BRIEF_SELECT },
      });
    });

    it('filter tree_id + gender lọt vào where; gender rác thì không', async () => {
      await service.getAllMembers(1, 10, undefined, undefined, 'created_at', 'desc', 'full', 'tree-1', 'M');
      expect(listArg().where).toEqual(
        expect.objectContaining({ tree_id: 'tree-1', gender: 'M' }),
      );

      mockPrisma.member.findMany.mockClear();
      await service.getAllMembers(1, 10, undefined, undefined, 'created_at', 'desc', 'full', undefined, 'HACK');
      expect(listArg().where).not.toHaveProperty('gender');
    });
  });

  describe('getMemberById / getMemberProfile — tree luôn thu hẹp', () => {
    it('getMemberById include tree brief', async () => {
      await service.getMemberById('m1');
      const arg = mockPrisma.member.findUnique.mock.calls[0][0];
      expect(arg.include.tree).toEqual({ select: TREE_BRIEF_SELECT });
      expect(arg.include.profile).toBe(true);
    });

    it('getMemberProfile: người thân dùng MEMBER_LITE_SELECT, không profile lồng', async () => {
      await service.getMemberProfile('m1');
      const arg = mockPrisma.member.findUnique.mock.calls[0][0];
      expect(arg.include.tree).toEqual({ select: TREE_BRIEF_SELECT });
      expect(arg.include.parent_relationships.select.parent).toEqual({ select: MEMBER_LITE_SELECT });
      expect(arg.include.child_relationships.select.child).toEqual({ select: MEMBER_LITE_SELECT });
      // Không được kéo full profile của người thân.
      expect(arg.include.parent_relationships.select.parent.include).toBeUndefined();
    });
  });
});

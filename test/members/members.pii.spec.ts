import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { MembersService } from '../../src/members/members.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QStashService } from '../../src/queue/qstash.service';
import { TasksService } from '../../src/queue/tasks.service';
import { GenerationService } from '../../src/generation/generation.service';
import { CallerMetaGuard } from '../../src/auth/caller-meta.guard';
import {
  PROFILE_CONTACT_FIELDS,
  PROFILE_FULL_SELECT,
  PROFILE_PUBLIC_SELECT,
  PROFILE_TABLE_PUBLIC_SELECT,
} from '../../src/members/members.select';

const mockPrisma = {
  member: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  userMetadata: { findUnique: jest.fn() },
};
const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

describe('Lọc thông tin liên lạc theo role', () => {
  describe('select fragments', () => {
    // Cột Profile mới thêm vào schema sẽ KHÔNG tự lọt vào PROFILE_FULL_SELECT
    // (nó liệt kê tay). Assertion này biến "quên cập nhật" thành CI đỏ thay vì
    // một cột âm thầm biến mất khỏi API.
    it('PROFILE_FULL_SELECT phủ đúng mọi cột của model Profile', () => {
      expect(Object.keys(PROFILE_FULL_SELECT).sort()).toEqual(
        Object.keys(Prisma.ProfileScalarFieldEnum).sort(),
      );
    });

    it('PROFILE_PUBLIC_SELECT = FULL trừ đúng 4 cột liên lạc', () => {
      for (const field of PROFILE_CONTACT_FIELDS) {
        expect(PROFILE_FULL_SELECT).toHaveProperty(field);
        expect(PROFILE_PUBLIC_SELECT).not.toHaveProperty(field);
      }
      expect(Object.keys(PROFILE_PUBLIC_SELECT).length).toBe(
        Object.keys(PROFILE_FULL_SELECT).length - PROFILE_CONTACT_FIELDS.length,
      );
    });

    it('bản table cũng bỏ address + phone', () => {
      expect(PROFILE_TABLE_PUBLIC_SELECT).not.toHaveProperty('address');
      expect(PROFILE_TABLE_PUBLIC_SELECT).not.toHaveProperty('phone');
    });
  });

  describe('MembersService truyền đúng select', () => {
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
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1' });
    });

    const lastFindUnique = () => mockPrisma.member.findUnique.mock.calls[0][0];

    it.each([
      ['getMemberById', (canSeePii: boolean) => (s: MembersService) => s.getMemberById('m1', canSeePii)],
      ['getMemberProfile', (canSeePii: boolean) => (s: MembersService) => s.getMemberProfile('m1', canSeePii)],
    ])('%s: canSeePii=false → bản đã lọc, true → bản đầy đủ', async (_name, call) => {
      await call(false)(service);
      expect(lastFindUnique().include.profile).toEqual({ select: PROFILE_PUBLIC_SELECT });

      jest.clearAllMocks();
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1' });
      await call(true)(service);
      expect(lastFindUnique().include.profile).toEqual({ select: PROFILE_FULL_SELECT });
    });
  });

  describe('CallerMetaGuard', () => {
    const prisma = { userMetadata: { findUnique: jest.fn() } } as any;
    const guard = new CallerMetaGuard(prisma);
    const ctxFor = (req: any) =>
      ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;

    beforeEach(() => jest.clearAllMocks());

    it('người CHƯA đăng nhập: cho qua (route @Public) nhưng canSeePii=false', async () => {
      const req: any = {};
      await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
      expect(req.canSeePii).toBe(false);
      expect(prisma.userMetadata.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      [['guest'], false],
      // editor xếp TRÊN member về quyền ghi nhưng là người ngoài dòng họ.
      [['editor'], false],
      [['member'], true],
      [['admin'], true],
    ])('roles=%s → canSeePii=%s', async (roles, expected) => {
      prisma.userMetadata.findUnique.mockResolvedValue({ roles, profile_member_id: null });
      const req: any = { user: { id: 'u1' } };
      await guard.canActivate(ctxFor(req));
      expect(req.canSeePii).toBe(expected);
    });
  });
});

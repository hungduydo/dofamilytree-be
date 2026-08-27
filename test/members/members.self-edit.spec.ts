import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MembersService } from '../../src/members/members.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QStashService } from '../../src/queue/qstash.service';
import { TasksService } from '../../src/queue/tasks.service';
import { GenerationService } from '../../src/generation/generation.service';

/**
 * "Member sửa được hồ sơ của chính mình" là ràng buộc theo BẢN GHI, thứ
 * RolesGuard (gác theo route) không diễn đạt được — nên nó nằm trong service và
 * được khoá ở đây.
 */
const mockPrisma = {
  member: { findUnique: jest.fn(), update: jest.fn() },
  profile: { update: jest.fn() },
  $transaction: jest.fn(),
};
const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
const mockGeneration = { enqueueRecompute: jest.fn() };

const OWN_ID = 'member-cua-toi';
const OTHER_ID = 'member-nguoi-khac';

describe('MembersService.updateMemberProfile — quyền sửa', () => {
  let service: MembersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QStashService, useValue: { publish: jest.fn() } },
        { provide: TasksService, useValue: { handleAvatarUpload: jest.fn() } },
        { provide: GenerationService, useValue: mockGeneration },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();
    service = module.get<MembersService>(MembersService);
    jest.clearAllMocks();
    mockPrisma.member.findUnique.mockResolvedValue({ id: OWN_ID, profile: { id: 'p1' } });
    mockPrisma.member.update.mockResolvedValue({ id: OWN_ID });
    mockPrisma.profile.update.mockResolvedValue({ id: 'p1' });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  });

  const editor = { roles: ['editor'], profileMemberId: null };
  const admin = { roles: ['admin'], profileMemberId: null };
  const member = { roles: ['member'], profileMemberId: OWN_ID };
  const guest = { roles: ['guest'], profileMemberId: null };

  describe('editor / admin', () => {
    it('sửa được hồ sơ của người khác', async () => {
      await expect(
        service.updateMemberProfile(OTHER_ID, { occupation: 'Kỹ sư' } as any, undefined, editor),
      ).resolves.toBeDefined();
    });

    it('sửa được cả field cấu trúc cây', async () => {
      await expect(
        service.updateMemberProfile(OTHER_ID, { generation: 4 } as any, undefined, admin),
      ).resolves.toBeDefined();
      expect(mockGeneration.enqueueRecompute).toHaveBeenCalled();
    });
  });

  describe('member — chính chủ', () => {
    it('sửa hồ sơ của CHÍNH MÌNH trong allowlist thì được', async () => {
      await expect(
        service.updateMemberProfile(OWN_ID, { occupation: 'Kỹ sư', phone: '090' } as any, undefined, member),
      ).resolves.toBeDefined();
    });

    it('sửa hồ sơ NGƯỜI KHÁC → 403', async () => {
      await expect(
        service.updateMemberProfile(OTHER_ID, { occupation: 'X' } as any, undefined, member),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.member.update).not.toHaveBeenCalled();
    });

    // Đây là lý do phải có allowlist chứ không chỉ kiểm tra chính chủ: sửa
    // `generation` của mình kéo theo tính lại đời của TOÀN BỘ hậu duệ.
    it.each([
      ['generation', { generation: 9 }],
      ['tree_id', { tree_id: 'tree-x' }],
      ['clanRole', { clanRole: 'truong-toc' }],
      ['roleTags', { roleTags: ['vip'] }],
      ['notes', { notes: 'tự ghi chú' }],
    ])('gửi kèm %s → 400, KHÔNG ghi gì', async (_field, patch) => {
      await expect(
        service.updateMemberProfile(OWN_ID, patch as any, undefined, member),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.member.update).not.toHaveBeenCalled();
      expect(mockGeneration.enqueueRecompute).not.toHaveBeenCalled();
    });

    it('field bị chặn nhưng giá trị undefined thì bỏ qua, không 400', async () => {
      await expect(
        service.updateMemberProfile(OWN_ID, { occupation: 'X', generation: undefined } as any, undefined, member),
      ).resolves.toBeDefined();
    });
  });

  describe('mặc định an toàn', () => {
    it('guest → 403', async () => {
      await expect(
        service.updateMemberProfile(OWN_ID, { occupation: 'X' } as any, undefined, guest),
      ).rejects.toThrow(ForbiddenException);
    });

    it('không truyền caller (quên nối guard) → 403 chứ không mở toang', async () => {
      await expect(
        service.updateMemberProfile(OWN_ID, { occupation: 'X' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    // profileMemberId đến từ DB chứ không từ JWT: token cũ vẫn mang link đã bị
    // admin gỡ, và sẽ cho sửa hồ sơ người khác suốt TTL còn lại của token.
    it('member đã bị gỡ link (DB trả null) → 403', async () => {
      await expect(
        service.updateMemberProfile(OWN_ID, { occupation: 'X' } as any, undefined, {
          roles: ['member'],
          profileMemberId: null,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

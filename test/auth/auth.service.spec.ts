import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/storage/storage.service';

const mockSignUp = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signUp: (...args: any[]) => mockSignUp(...args),
      admin: { getUserById: jest.fn().mockResolvedValue({ data: { user: null } }) },
    },
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthService } = require('../../src/auth/auth.service');

const mockPrisma = {
  userMetadata: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  member: { findUnique: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
};
const mockStorage = { put: jest.fn() };

const REGISTER_DTO = { email: 'a@b.com', password: 'secret123', fullName: 'Nguyễn Văn A' };

describe('AuthService', () => {
  let service: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: { sign: jest.fn(() => 'token') } },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  });

  describe('register — CHỈ tạo guest', () => {
    beforeEach(() => {
      mockSignUp.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
      mockPrisma.userMetadata.create.mockImplementation(({ data }: any) => data);
    });

    it('tạo UserMetadata guest, KHÔNG tạo Member/Profile', async () => {
      const result = await service.register(REGISTER_DTO as any);

      const created = mockPrisma.userMetadata.create.mock.calls[0][0].data;
      expect(created.roles).toEqual(['guest']);
      expect(created.profile_member_id).toBeNull();
      expect(result).toMatchObject({ profileMemberId: null, status: 'pending_link' });
      // Luồng cũ tự dựng Member rồi tự nhận là người trong họ — đúng thứ đã bỏ.
      expect((mockPrisma as any).member.create).toBeUndefined();
    });

    it('cất thông tin tự khai vào claim_request để admin duyệt', async () => {
      await service.register({ ...REGISTER_DTO, occupation: 'Kỹ sư', generation: 3 } as any);
      const claim = mockPrisma.userMetadata.create.mock.calls[0][0].data.claim_request;
      expect(claim).toMatchObject({ fullName: 'Nguyễn Văn A', occupation: 'Kỹ sư', generation: 3 });
      expect(claim.submittedAt).toEqual(expect.any(String));
    });

    it('ghi Display name vào cả ba key metadata của Supabase', async () => {
      await service.register(REGISTER_DTO as any);
      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            data: expect.objectContaining({
              display_name: 'Nguyễn Văn A',
              full_name: 'Nguyễn Văn A',
              name: 'Nguyễn Văn A',
            }),
          },
        }),
      );
    });

    it('avatar được upload và giữ URL trong claim_request', async () => {
      mockStorage.put.mockResolvedValue('https://blob/avatar.png');
      await service.register(REGISTER_DTO as any, {
        originalname: 'avatar.png', buffer: Buffer.from(''), mimetype: 'image/png',
      } as any);
      expect(mockPrisma.userMetadata.create.mock.calls[0][0].data.claim_request.avatarUrl)
        .toBe('https://blob/avatar.png');
    });

    it('storage hỏng KHÔNG làm hỏng việc đăng ký', async () => {
      mockStorage.put.mockRejectedValue(new Error('blob down'));
      const result = await service.register(REGISTER_DTO as any, {
        originalname: 'a.png', buffer: Buffer.from(''), mimetype: 'image/png',
      } as any);
      expect(result.id).toBe('u1');
      expect(mockPrisma.userMetadata.create.mock.calls[0][0].data.claim_request.avatarUrl).toBeNull();
    });
  });

  describe('assignRoles', () => {
    it('chống tự khoá: không tự đổi role của chính mình', async () => {
      await expect(service.assignRoles('u1', 'u1', { roles: ['guest'] })).rejects.toThrow(ForbiddenException);
    });

    it('404 khi tài khoản đích không tồn tại', async () => {
      mockPrisma.userMetadata.findUnique.mockResolvedValue(null);
      await expect(service.assignRoles('admin1', 'ghost', { roles: ['editor'] })).rejects.toThrow(NotFoundException);
    });

    it("400 khi gán 'member' cho tài khoản chưa link member nào", async () => {
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['guest'], profile_member_id: null });
      await expect(service.assignRoles('admin1', 'u2', { roles: ['member'] })).rejects.toThrow(BadRequestException);
    });

    it('chuẩn hoá mảng nhiều role về role CAO NHẤT', async () => {
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['guest'], profile_member_id: null });
      mockPrisma.userMetadata.update.mockResolvedValue({ roles: ['admin'] });
      const result = await service.assignRoles('admin1', 'u2', { roles: ['guest', 'admin'] });
      expect(mockPrisma.userMetadata.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { roles: ['admin'] } }),
      );
      expect(result.role).toBe('admin');
    });
  });

  describe('linkMember', () => {
    const dto = { memberId: 'm1' };

    it('nâng guest lên member và gắn linked_at', async () => {
      mockPrisma.userMetadata.findUnique
        .mockResolvedValueOnce({ roles: ['guest'], profile_member_id: null, claim_request: {} })
        .mockResolvedValueOnce(null); // member chưa bị tài khoản nào chiếm
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', avatar_url: null });
      mockPrisma.userMetadata.update.mockResolvedValue({ roles: ['member'], profile_member_id: 'm1' });

      const result = await service.linkMember('admin1', 'u2', dto);
      expect(result.role).toBe('member');
      expect(mockPrisma.userMetadata.update.mock.calls[0][0].data.linked_at).toEqual(expect.any(Date));
    });

    it('KHÔNG hạ cấp editor/admin khi link', async () => {
      mockPrisma.userMetadata.findUnique
        .mockResolvedValueOnce({ roles: ['admin'], profile_member_id: null, claim_request: {} })
        .mockResolvedValueOnce(null);
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', avatar_url: null });
      mockPrisma.userMetadata.update.mockResolvedValue({ roles: ['admin'], profile_member_id: 'm1' });

      await service.linkMember('admin1', 'u2', dto);
      expect(mockPrisma.userMetadata.update.mock.calls[0][0].data.roles).toEqual(['admin']);
    });

    it('copy avatar tự khai sang member chưa có ảnh', async () => {
      mockPrisma.userMetadata.findUnique
        .mockResolvedValueOnce({ roles: ['guest'], profile_member_id: null, claim_request: { avatarUrl: 'https://blob/a.png' } })
        .mockResolvedValueOnce(null);
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', avatar_url: null });
      mockPrisma.userMetadata.update.mockResolvedValue({ roles: ['member'], profile_member_id: 'm1' });

      await service.linkMember('admin1', 'u2', dto);
      expect(mockPrisma.member.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { avatar_url: 'https://blob/a.png' },
      });
    });

    it('KHÔNG đè avatar member đã có — dữ liệu dòng họ ưu tiên', async () => {
      mockPrisma.userMetadata.findUnique
        .mockResolvedValueOnce({ roles: ['guest'], profile_member_id: null, claim_request: { avatarUrl: 'https://blob/a.png' } })
        .mockResolvedValueOnce(null);
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', avatar_url: 'https://blob/cu.png' });
      mockPrisma.userMetadata.update.mockResolvedValue({ roles: ['member'], profile_member_id: 'm1' });

      await service.linkMember('admin1', 'u2', dto);
      expect(mockPrisma.member.update).not.toHaveBeenCalled();
    });

    it('409 khi tài khoản đã link member khác', async () => {
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['member'], profile_member_id: 'm-cu' });
      await expect(service.linkMember('admin1', 'u2', dto)).rejects.toThrow(ConflictException);
    });

    it('404 khi member không tồn tại', async () => {
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['guest'], profile_member_id: null });
      mockPrisma.member.findUnique.mockResolvedValue(null);
      await expect(service.linkMember('admin1', 'u2', dto)).rejects.toThrow(NotFoundException);
    });

    // profile_member_id là @unique — chặn trước để ra 409 rõ ràng thay vì Prisma
    // P2002 biến thành 500.
    it('409 khi member đã thuộc tài khoản khác', async () => {
      mockPrisma.userMetadata.findUnique
        .mockResolvedValueOnce({ roles: ['guest'], profile_member_id: null })
        .mockResolvedValueOnce({ user_id: 'u9' });
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', avatar_url: null });
      await expect(service.linkMember('admin1', 'u2', dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('unlinkMember', () => {
    it('không tự gỡ link của chính mình', async () => {
      await expect(service.unlinkMember('u1', 'u1')).rejects.toThrow(ForbiddenException);
    });

    it('member → guest', async () => {
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['member'], profile_member_id: 'm1' });
      mockPrisma.userMetadata.update.mockResolvedValue({ roles: ['guest'], profile_member_id: null });
      await service.unlinkMember('admin1', 'u2');
      expect(mockPrisma.userMetadata.update.mock.calls[0][0].data.roles).toEqual(['guest']);
    });

    it('editor/admin giữ nguyên role khi gỡ link', async () => {
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['editor'], profile_member_id: 'm1' });
      mockPrisma.userMetadata.update.mockResolvedValue({ roles: ['editor'], profile_member_id: null });
      await service.unlinkMember('admin1', 'u2');
      expect(mockPrisma.userMetadata.update.mock.calls[0][0].data.roles).toEqual(['editor']);
    });
  });
});

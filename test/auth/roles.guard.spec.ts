import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../src/auth/roles.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ROLES_KEY } from '../../src/auth/roles.decorator';
import { MediaController } from '../../src/media/media.controller';

const mockPrisma = { userMetadata: { findUnique: jest.fn() } };

/** ExecutionContext tối thiểu: chỉ cần `request.user` + handler/class cho Reflector. */
function ctxFor(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => function handler() {},
    getClass: () => class Ctrl {},
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    guard = module.get(RolesGuard);
    reflector = module.get(Reflector);
  });

  it('cho qua khi route không khai báo @Roles', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    await expect(guard.canActivate(ctxFor({ id: 'u1' }))).resolves.toBe(true);
    expect(mockPrisma.userMetadata.findUnique).not.toHaveBeenCalled();
  });

  it('cho qua khi UserMetadata có role yêu cầu', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['member', 'admin'] });
    await expect(guard.canActivate(ctxFor({ id: 'u1' }))).resolves.toBe(true);
  });

  it('chặn user thường (403)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['member'] });
    await expect(guard.canActivate(ctxFor({ id: 'u1' }))).rejects.toThrow(ForbiddenException);
  });

  it('chặn khi không có UserMetadata', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    mockPrisma.userMetadata.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(ctxFor({ id: 'u1' }))).rejects.toThrow(ForbiddenException);
  });

  it('BỎ QUA roles trong JWT payload — chỉ tin DB', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    // Token cũ vẫn mang 'admin' nhưng DB đã gỡ role.
    mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['member'] });
    await expect(guard.canActivate(ctxFor({ id: 'u1', roles: ['admin'] }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  describe('phân cấp guest < member < editor < admin', () => {
    const require = (roles: string[]) =>
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

    it("admin qua được @Roles('member') — không phải liệt kê admin ở mọi route", async () => {
      require(['member']);
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['admin'] });
      await expect(guard.canActivate(ctxFor({ id: 'u1' }))).resolves.toBe(true);
    });

    it("editor qua được @Roles('member') nhưng TRƯỢT @Roles('admin')", async () => {
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['editor'] });

      require(['member']);
      await expect(guard.canActivate(ctxFor({ id: 'u1' }))).resolves.toBe(true);

      require(['admin']);
      await expect(guard.canActivate(ctxFor({ id: 'u1' }))).rejects.toThrow(ForbiddenException);
    });

    it("guest trượt @Roles('member')", async () => {
      require(['member']);
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['guest'] });
      await expect(guard.canActivate(ctxFor({ id: 'u1' }))).rejects.toThrow(ForbiddenException);
    });

    it('nhiều role yêu cầu → lấy mức THẤP nhất (giữ ngữ nghĩa OR)', async () => {
      require(['admin', 'member']);
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['member'] });
      await expect(guard.canActivate(ctxFor({ id: 'u1' }))).resolves.toBe(true);
    });

    it('@Roles gõ sai tên role → chặn, KHÔNG mở toang route', async () => {
      require(['administrator']);
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['admin'] });
      await expect(guard.canActivate(ctxFor({ id: 'u1' }))).rejects.toThrow(ForbiddenException);
    });

    it('memo hoá: hai guard trên cùng request chỉ đọc DB một lần', async () => {
      require(['member']);
      mockPrisma.userMetadata.findUnique.mockResolvedValue({ roles: ['admin'] });

      // CÙNG một request object, khác với ctxFor() vốn tạo request mới mỗi lần.
      const req: any = { user: { id: 'u1' } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => function handler() {},
        getClass: () => class Ctrl {},
      } as unknown as ExecutionContext;

      await guard.canActivate(ctx);
      await guard.canActivate(ctx);
      expect(mockPrisma.userMetadata.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  it('chặn khi request chưa có user', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    await expect(guard.canActivate(ctxFor(undefined))).rejects.toThrow(ForbiddenException);
  });
});

describe('MediaController delete routes', () => {
  const reflector = new Reflector();

  it('DELETE /media/:id yêu cầu role admin', () => {
    expect(reflector.get(ROLES_KEY, MediaController.prototype.deleteMedia)).toEqual(['admin']);
  });

  it('DELETE /media/albums/:id yêu cầu role admin', () => {
    expect(reflector.get(ROLES_KEY, MediaController.prototype.deleteAlbum)).toEqual(['admin']);
  });
});

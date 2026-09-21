import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { resolveCallerMeta } from '../../src/auth/user-meta';

/**
 * Tài khoản bị khoá phải mất quyền NGAY — token phát trước khi khoá còn hạn tới
 * 1 ngày, nên chặn ở login thôi là chưa đủ.
 */
describe('JwtStrategy.validate', () => {
  const setup = (row: any) => {
    const prisma = { userMetadata: { findUnique: jest.fn().mockResolvedValue(row) } };
    return { strategy: new JwtStrategy(prisma as any), prisma };
  };
  const PAYLOAD = { sub: 'u1', email: 'a@b.com', roles: ['member'], profileMemberId: 'm1' };

  it('401 khi tài khoản đã bị khoá, dù token còn hạn', async () => {
    const { strategy } = setup({ roles: ['member'], profile_member_id: 'm1', deactivated_at: new Date() });
    await expect(strategy.validate({}, PAYLOAD)).rejects.toThrow(UnauthorizedException);
  });

  it('tài khoản hoạt động: trả user như trước', async () => {
    const { strategy } = setup({ roles: ['member'], profile_member_id: 'm1', deactivated_at: null });
    await expect(strategy.validate({}, PAYLOAD)).resolves.toMatchObject({ id: 'u1', profileMemberId: 'm1' });
  });

  it('ghi sẵn memo để RolesGuard / CallerMetaGuard không đọc lại DB', async () => {
    const { strategy, prisma } = setup({ roles: ['editor'], profile_member_id: null, deactivated_at: null });
    const req: any = {};
    await strategy.validate(req, PAYLOAD);

    await expect(resolveCallerMeta(req, prisma as any)).resolves.toEqual({
      roles: ['editor'],
      profileMemberId: null,
    });
    expect(prisma.userMetadata.findUnique).toHaveBeenCalledTimes(1);
  });

  it('401 khi payload không có user id', async () => {
    const { strategy, prisma } = setup(null);
    await expect(strategy.validate({}, {})).rejects.toThrow(UnauthorizedException);
    expect(prisma.userMetadata.findUnique).not.toHaveBeenCalled();
  });
});

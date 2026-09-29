import { NotificationsController } from '../../src/notifications/notifications.controller';
import { createUnsubscribeToken, verifyUnsubscribeToken } from '../../src/notifications/unsubscribe-token';

describe('unsubscribe token', () => {
  const OLD = process.env.JWT_SECRET;
  beforeEach(() => (process.env.JWT_SECRET = 'test-secret'));
  afterAll(() => (process.env.JWT_SECRET = OLD));

  it('ký rồi xác minh ra đúng user', () => {
    expect(verifyUnsubscribeToken(createUnsubscribeToken('user-1'))).toBe('user-1');
  });

  it('đổi userId trong token ⇒ không hợp lệ', () => {
    const [, sig] = createUnsubscribeToken('user-1')!.split('.');
    expect(verifyUnsubscribeToken(`user-2.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken('rác')).toBeNull();
    expect(verifyUnsubscribeToken(undefined)).toBeNull();
  });

  it('thiếu JWT_SECRET ⇒ không phát token (email vẫn gửi, không có link)', () => {
    delete process.env.JWT_SECRET;
    expect(createUnsubscribeToken('user-1')).toBeNull();
  });
});

describe('NotificationsController — tắt nhắc', () => {
  beforeEach(() => (process.env.JWT_SECRET = 'test-secret'));

  const build = () => {
    const prisma: any = {
      userMetadata: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ anniversary_reminders: true }),
      },
    };
    return { prisma, controller: new NotificationsController(prisma) };
  };

  it('GET chỉ hiện trang xác nhận, KHÔNG tắt — bộ quét link của hộp thư tự mở mọi link', () => {
    const t = build();
    const html = t.controller.unsubscribePage(createUnsubscribeToken('user-1')!);
    expect(html).toContain('<form method="post"');
    expect(t.prisma.userMetadata.updateMany).not.toHaveBeenCalled();
  });

  it('POST với token hợp lệ tắt đúng tài khoản đó', async () => {
    const t = build();
    const html = await t.controller.unsubscribe(createUnsubscribeToken('user-1')!);
    expect(t.prisma.userMetadata.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1' },
      data: { anniversary_reminders: false },
    });
    expect(html).toContain('Đã tắt nhắc ngày giỗ');
  });

  it('POST với token giả không đụng DB', async () => {
    const t = build();
    await t.controller.unsubscribe('user-1.gia-mao');
    expect(t.prisma.userMetadata.updateMany).not.toHaveBeenCalled();
  });

  it('PUT preferences chỉ sửa tài khoản của chính người gọi', async () => {
    const t = build();
    await t.controller.updatePreferences({ id: 'me' }, { anniversaryReminders: false });
    expect(t.prisma.userMetadata.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'me' },
      data: { anniversary_reminders: false },
    });
  });
});

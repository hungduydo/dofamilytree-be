import { AnniversaryReminderService } from '../../src/notifications/anniversary-reminder.service';

// 29/09/2026 07:00 giờ VN.
const NOW = new Date('2026-09-29T00:00:00Z');

/**
 * Ngày kỵ DƯƠNG lịch rơi đúng `days` ngày sau NOW — cho test không phụ thuộc
 * vào bảng quy đổi âm lịch.
 */
function annDueIn(days: number, over: Record<string, any> = {}) {
  const d = new Date(Date.UTC(2026, 8, 29 + days));
  return {
    id: `ann-${days}-${over.member_id ?? 'clan'}`,
    kind: 'DEATH',
    calendar: 'SOLAR',
    day: d.getUTCDate(),
    month: d.getUTCMonth() + 1,
    isLeapMonth: false,
    title: null,
    description: null,
    member_id: null,
    cemetery_id: null,
    created_at: NOW,
    updated_at: NOW,
    member: null,
    cemetery: null,
    ...over,
  };
}

function build(opts: { anniversaries: any[]; recipients?: any[]; edges?: any[]; emails?: Record<string, string> }) {
  const prisma: any = {
    anniversary: { findMany: jest.fn().mockResolvedValue(opts.anniversaries) },
    userMetadata: { findMany: jest.fn().mockResolvedValue(opts.recipients ?? []) },
    memberRelationship: { findMany: jest.fn().mockResolvedValue(opts.edges ?? []) },
  };
  const mail = { isConfigured: jest.fn().mockReturnValue(true), send: jest.fn().mockResolvedValue(undefined) };
  const supabase = { getEmails: jest.fn().mockResolvedValue(new Map(Object.entries(opts.emails ?? {}))) };
  const sentKeys = new Set<string>();
  const redis: any = {
    set: jest.fn(async (key: string) => (sentKeys.has(key) ? null : (sentKeys.add(key), 'OK'))),
    del: jest.fn(async (key: string) => sentKeys.delete(key)),
  };
  return { prisma, mail, supabase, redis, sentKeys, service: new AnniversaryReminderService(prisma, mail as any, supabase as any, redis) };
}

const chau = { user_id: 'u-chau', profile_member_id: 'chau', profile_member: { name: 'Đỗ Văn Cháu' } };
const edges = [{ parent_id: 'ong', child_id: 'chau', type: 'BIOLOGICAL' }];
const kyOng = (days: number) => annDueIn(days, { member_id: 'ong', member: { id: 'ong', name: 'Đỗ Văn Ông', avatar_url: null, generation: 3, deathDate: null } });

describe('AnniversaryReminderService', () => {
  it('chỉ nhắc khi còn đúng 7 hoặc 1 ngày', async () => {
    const t = build({ anniversaries: [kyOng(3), kyOng(30)], recipients: [chau], edges, emails: { 'u-chau': 'c@x.vn' } });
    const res = await t.service.sendDailyReminders(NOW);
    expect(res.dueAnniversaries).toBe(0);
    // Không có gì đến hạn ⇒ không cả đọc danh sách người nhận.
    expect(t.prisma.userMetadata.findMany).not.toHaveBeenCalled();
    expect(t.mail.send).not.toHaveBeenCalled();
  });

  it('gửi cho cháu ngày kỵ của ông, gộp một thư', async () => {
    const t = build({ anniversaries: [kyOng(7), annDueIn(1, { kind: 'CLAN', title: 'Giỗ tổ' })], recipients: [chau], edges, emails: { 'u-chau': 'c@x.vn' } });
    const res = await t.service.sendDailyReminders(NOW);
    expect(res).toMatchObject({ dueAnniversaries: 2, recipients: 1, sent: 1 });
    const mail = t.mail.send.mock.calls[0][0];
    expect(mail.to).toEqual(['c@x.vn']);
    expect(mail.subject).toBe('Nhắc ngày giỗ: 2 ngày giỗ sắp tới trong gia đình');
    expect(mail.text).toContain('Kỵ Đỗ Văn Ông');
  });

  it('chỉ lấy tài khoản đã duyệt, đang hoạt động, bật nhắc, là member/admin', async () => {
    const t = build({ anniversaries: [kyOng(7)] });
    await t.service.sendDailyReminders(NOW);
    expect(t.prisma.userMetadata.findMany.mock.calls[0][0].where).toEqual({
      profile_member_id: { not: null },
      deactivated_at: null,
      anniversary_reminders: true,
      roles: { hasSome: ['member', 'admin'] },
    });
  });

  it('QStash retry không gửi trùng — chỉ gửi lại cho người lỗi', async () => {
    const other = { user_id: 'u-2', profile_member_id: 'chau2', profile_member: { name: 'B' } };
    const t = build({
      anniversaries: [kyOng(7)],
      recipients: [chau, other],
      edges: [...edges, { parent_id: 'ong', child_id: 'chau2', type: 'BIOLOGICAL' }],
      emails: { 'u-chau': 'c@x.vn', 'u-2': 'b@x.vn' },
    });
    t.mail.send.mockImplementationOnce(async () => undefined).mockImplementationOnce(async () => {
      throw new Error('Resend 500');
    });

    await expect(t.service.sendDailyReminders(NOW)).rejects.toThrow('1 email');
    // Lần retry: người đã nhận bị bỏ qua, người lỗi được gửi lại.
    const res = await t.service.sendDailyReminders(NOW);
    expect(res).toMatchObject({ sent: 1, alreadySent: 1, failed: 0 });
    expect(t.mail.send.mock.calls.map((c: any) => c[0].to[0])).toEqual(['c@x.vn', 'b@x.vn', 'b@x.vn']);
  });

  it('thiếu cấu hình mail ⇒ log lỗi, KHÔNG ném (retry không làm env tự có)', async () => {
    const t = build({ anniversaries: [kyOng(7)] });
    t.mail.isConfigured.mockReturnValue(false);
    await expect(t.service.sendDailyReminders(NOW)).resolves.toMatchObject({ sent: 0 });
    expect(t.prisma.anniversary.findMany).not.toHaveBeenCalled();
  });
});

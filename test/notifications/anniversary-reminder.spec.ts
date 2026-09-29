import {
  ReminderAnniversary,
  buildAnniversaryReminderEmail,
  formatLunarDay,
  formatSolarDay,
  relativesToRemember,
  remindersFor,
} from '../../src/notifications/anniversary-reminder';

const edge = (parent_id: string, child_id: string, type = 'BIOLOGICAL') => ({ parent_id, child_id, type });

const ann = (over: Partial<ReminderAnniversary>): ReminderAnniversary => ({
  id: 'a',
  kind: 'DEATH',
  calendar: 'LUNAR',
  day: 5,
  month: 3,
  isLeapMonth: false,
  displayTitle: 'Kỵ cụ A',
  member_id: null,
  nextOccurrence: '2026-10-06',
  daysUntil: 7,
  yearsSinceDeath: null,
  cemetery: null,
  ...over,
});

describe('relativesToRemember', () => {
  //   cụ ── ông ── cha ── TÔI ⇄ vợ
  //                 └── chú (anh em của cha, KHÔNG phải trực hệ)
  const edges = [
    edge('cu', 'ong'),
    edge('ong', 'cha'),
    edge('ong', 'chu'),
    edge('cha', 'toi'),
    edge('me-nuoi', 'toi', 'ADOPTED'),
    edge('toi', 'vo', 'SPOUSE'),
    edge('toi', 'con'),
  ];

  it('tổ tiên trực hệ mọi đời (ruột + nuôi) và vợ/chồng — không có anh em, con cháu', () => {
    expect([...relativesToRemember('toi', edges)].sort()).toEqual(['cha', 'cu', 'me-nuoi', 'ong', 'vo']);
  });

  it('dữ liệu lỡ có vòng cha–con không làm treo', () => {
    const cyclic = [edge('a', 'b'), edge('b', 'a'), edge('a', 'toi')];
    expect([...relativesToRemember('toi', cyclic)].sort()).toEqual(['a', 'b']);
  });
});

describe('remindersFor', () => {
  it('ngày kỵ của người thân ✓, người dưng ✗, ngày chung của họ ✓', () => {
    const list = [
      ann({ id: 'ong', member_id: 'ong' }),
      ann({ id: 'nguoi-dung', member_id: 'x' }),
      ann({ id: 'gio-to', kind: 'CLAN', member_id: null }),
      ann({ id: 'death-khong-gan', kind: 'DEATH', member_id: null }),
    ];
    expect(remindersFor(list, new Set(['ong'])).map((a) => a.id)).toEqual(['ong', 'gio-to']);
  });
});

describe('định dạng ngày', () => {
  it('ngày dương kèm thứ', () => {
    expect(formatSolarDay('2026-09-29')).toBe('Thứ Ba, 29/09/2026');
  });

  it('ngày âm của CHÍNH lần sắp tới, "mùng" cho ngày 1–10', () => {
    // 29/09/2026 dương = 19/8 âm năm Bính Ngọ.
    expect(formatLunarDay('2026-09-29')).toBe('19 tháng 8 âm lịch');
    expect(formatLunarDay('2026-09-11')).toMatch(/^mùng \d+ tháng/);
  });
});

describe('buildAnniversaryReminderEmail', () => {
  const base = {
    to: 'chau@example.com',
    recipientName: 'Đỗ Văn Cháu',
    calendarUrl: 'https://giapha.vn/anniversaries',
    unsubscribeUrl: 'https://api.giapha.vn/v2/notifications/unsubscribe?token=abc',
  };

  it('một ngày: tiêu đề nêu tên + còn bao lâu; có header List-Unsubscribe one-click', () => {
    const mail = buildAnniversaryReminderEmail({
      ...base,
      items: [ann({ displayTitle: 'Kỵ cụ Đỗ Văn A', daysUntil: 1, yearsSinceDeath: 30, cemetery: { name: 'Đùng Vành' } })],
    });
    expect(mail.subject).toBe('Nhắc ngày giỗ: Kỵ cụ Đỗ Văn A — ngày mai');
    expect(mail.text).toContain('Tròn 30 năm ngày mất');
    expect(mail.text).toContain('Mộ phần: Đùng Vành');
    expect(mail.headers).toEqual({
      'List-Unsubscribe': `<${base.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('nhiều ngày: tiêu đề đếm số, sắp theo ngày gần nhất', () => {
    const mail = buildAnniversaryReminderEmail({
      ...base,
      items: [ann({ displayTitle: 'Xa', daysUntil: 7 }), ann({ displayTitle: 'Gần', daysUntil: 1 })],
    });
    expect(mail.subject).toBe('Nhắc ngày giỗ: 2 ngày giỗ sắp tới trong gia đình');
    expect(mail.text.indexOf('Gần')).toBeLessThan(mail.text.indexOf('Xa'));
  });

  it('escape HTML trong tên do người dùng nhập', () => {
    const mail = buildAnniversaryReminderEmail({
      ...base,
      recipientName: '<b>x</b>',
      items: [ann({ displayTitle: 'Kỵ <a href="http://evil">A</a>' })],
    });
    expect(mail.html).not.toContain('<a href="http://evil">');
    expect(mail.html).toContain('&lt;a href=&quot;http://evil&quot;&gt;');
    expect(mail.html).not.toContain('<b>x</b>');
  });

  it('không có link tắt ⇒ không gửi header List-Unsubscribe', () => {
    const mail = buildAnniversaryReminderEmail({ ...base, unsubscribeUrl: null, items: [ann({})] });
    expect(mail.headers).toBeUndefined();
  });
});

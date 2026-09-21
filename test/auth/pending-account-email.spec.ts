import { buildPendingAccountEmail } from '../../src/auth/pending-account-email';

const base = {
  to: ['admin@ho.vn'],
  registrantEmail: 'chau@example.com',
  claim: { fullName: 'Đỗ Văn A', generation: 15, submittedAt: '2026-09-21T03:00:00.000Z' },
  pendingCount: 1,
  reviewUrl: 'https://giapha.example/bo/users',
};

describe('buildPendingAccountEmail', () => {
  it('tiêu đề nêu tên người đăng ký', () => {
    expect(buildPendingAccountEmail(base).subject).toBe('[Gia Phả] Tài khoản mới chờ duyệt: Đỗ Văn A');
  });

  it('gửi đúng danh sách người nhận', () => {
    expect(buildPendingAccountEmail({ ...base, to: ['a@x', 'b@x'] }).to).toEqual(['a@x', 'b@x']);
  });

  it('có link tới trang duyệt ở cả text và html', () => {
    const mail = buildPendingAccountEmail(base);
    expect(mail.text).toContain('https://giapha.example/bo/users');
    expect(mail.html).toContain('href="https://giapha.example/bo/users"');
  });

  it('chỉ in field có giá trị — không bịa "Không rõ"', () => {
    const mail = buildPendingAccountEmail(base);
    expect(mail.text).toContain('Đời thứ: 15');
    expect(mail.text).toContain('Email: chau@example.com');
    expect(mail.text).not.toContain('Nghề nghiệp');
    expect(mail.text).not.toContain('Ngày sinh');
  });

  it('giờ gửi theo múi giờ Việt Nam', () => {
    expect(buildPendingAccountEmail(base).text).toMatch(/Gửi lúc: .*10:00/);
  });

  it('đổi mã giới tính sang tiếng Việt', () => {
    expect(buildPendingAccountEmail({ ...base, claim: { ...base.claim, gender: 'female' } }).text)
      .toContain('Giới tính: Nữ');
  });

  it('nói rõ độ dài hàng đợi', () => {
    expect(buildPendingAccountEmail(base).text).toContain('Đây là tài khoản duy nhất đang chờ duyệt.');
    expect(buildPendingAccountEmail({ ...base, pendingCount: 4 }).text)
      .toContain('Hàng đợi hiện có 4 tài khoản chờ duyệt');
  });

  it('cắt tiểu sử dài', () => {
    const mail = buildPendingAccountEmail({ ...base, claim: { ...base.claim, biography: 'x'.repeat(500) } });
    expect(mail.text).toContain(`Tiểu sử: ${'x'.repeat(300)}…`);
    expect(mail.text).not.toContain('x'.repeat(301));
  });

  it('escape HTML trong dữ liệu người lạ tự khai', () => {
    const mail = buildPendingAccountEmail({
      ...base,
      claim: { fullName: '<a href="https://evil">Bấm</a>', address: 'A & B' },
    });
    expect(mail.html).not.toContain('<a href="https://evil">');
    expect(mail.html).toContain('&lt;a href=&quot;https://evil&quot;&gt;');
    expect(mail.html).toContain('A &amp; B');
  });

  it('không có họ tên thì dùng email làm tên', () => {
    expect(buildPendingAccountEmail({ ...base, claim: {} }).subject).toContain('chau@example.com');
  });
});

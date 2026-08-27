import { pickDisplayName } from '../../src/supabase/supabase-users.service';

describe('pickDisplayName', () => {
  it('prefers display_name', () => {
    expect(pickDisplayName({ display_name: 'Đỗ Duy Hưng', full_name: 'X', name: 'Y' }))
      .toBe('Đỗ Duy Hưng');
  });

  // Supabase Studio hiện cùng một cột "Display name" cho cả ba key, tuỳ cách
  // tài khoản được tạo (đăng ký thường / OAuth / tạo tay).
  it('falls back through full_name then name', () => {
    expect(pickDisplayName({ full_name: 'Đỗ Duy Hưng' })).toBe('Đỗ Duy Hưng');
    expect(pickDisplayName({ name: 'Đỗ Duy Hưng' })).toBe('Đỗ Duy Hưng');
  });

  it('ignores blank and non-string values', () => {
    expect(pickDisplayName({ display_name: '   ', full_name: 'Đỗ Duy Hưng' })).toBe('Đỗ Duy Hưng');
    expect(pickDisplayName({ display_name: 42 })).toBeNull();
  });

  // Đúng trạng thái hiện tại của mọi tài khoản trong dự án: metadata chỉ có
  // email/email_verified, không có tên nào cả.
  it('returns null when no name key is present', () => {
    expect(pickDisplayName({ email: 'a@b.com', email_verified: true })).toBeNull();
    expect(pickDisplayName(undefined)).toBeNull();
    expect(pickDisplayName(null)).toBeNull();
  });
});

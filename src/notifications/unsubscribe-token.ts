import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Token cho link "tắt nhắc ngày giỗ" trong email: `<userId>.<hmac>`.
 *
 * Người bấm link KHÔNG đăng nhập (đang đọc mail trên điện thoại), nên chính
 * token phải chứng minh họ là chủ tài khoản. HMAC bằng JWT_SECRET: không giả
 * được, không hết hạn (link trong thư cũ vẫn phải tắt được), và chỉ làm được
 * đúng MỘT việc — tắt nhắc của đúng tài khoản đó. Có `purpose` trong chuỗi ký
 * để token này không bao giờ dùng lại được cho mục đích khác.
 */
const PURPOSE = 'unsubscribe:anniversary-reminders';

function secret(): string | null {
  return process.env.JWT_SECRET || null;
}

function sign(userId: string, key: string): string {
  return createHmac('sha256', key).update(`${PURPOSE}:${userId}`).digest('base64url');
}

/** null khi thiếu JWT_SECRET — email vẫn gửi, chỉ không có link một-cú-bấm. */
export function createUnsubscribeToken(userId: string): string | null {
  const key = secret();
  return key ? `${userId}.${sign(userId, key)}` : null;
}

/** userId nếu token hợp lệ, ngược lại null. */
export function verifyUnsubscribeToken(token: string | undefined | null): string | null {
  const key = secret();
  if (!key || !token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(userId, key));
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}

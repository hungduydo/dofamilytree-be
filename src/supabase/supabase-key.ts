/**
 * Nguồn duy nhất để lấy secret key của Supabase.
 *
 * Supabase đã bỏ hệ API key cũ (`anon` / `service_role` là JWT ký bằng JWT
 * secret của project) sang hệ mới `sb_publishable_…` / `sb_secret_…`. Key mới
 * thu hồi được từng cái, không phải đổi JWT secret của cả project.
 *
 * Backend chỉ dùng secret key; publishable key là việc của frontend.
 *
 * Vẫn đọc `SUPABASE_SERVICE_ROLE_KEY` làm fallback để môi trường nào chưa kịp
 * đổi biến thì vẫn chạy — nhưng key legacy đã bị tắt trên dashboard nên fallback
 * này chỉ còn ý nghĩa lịch sử, sẽ bỏ khi mọi nơi đã chuyển xong.
 */

/** Có cấu hình đủ để gọi Supabase không. Dùng ở chỗ Supabase là tuỳ chọn. */
export function hasSupabaseSecretKey(): boolean {
  return !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
}

/**
 * Ném lỗi rõ ràng thay vì để `createClient` nhận `undefined` — trước đây các
 * chỗ gọi dùng `process.env.X!`, thiếu biến thì lỗi mới nổ ở tận trong SDK.
 */
export function getSupabaseSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'Thiếu SUPABASE_SECRET_KEY (key mới dạng sb_secret_…). Lấy ở Supabase Dashboard → Settings → API keys.',
    );
  }
  return key;
}

export function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('Thiếu SUPABASE_URL.');
  return url;
}

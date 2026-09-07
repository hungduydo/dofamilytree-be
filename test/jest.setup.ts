/**
 * Giá trị env giả cho test.
 *
 * `@supabase/supabase-js` được mock trong các spec, nên key không cần thật —
 * chỉ cần tồn tại để `getSupabaseSecretKey()` không ném. Trước đây code dùng
 * `process.env.X!` nên thiếu biến vẫn lọt; giờ có kiểm tra tường minh thì test
 * phải khai báo, và như vậy tốt hơn: test không còn ăn theo `.env` của máy dev.
 */
process.env.SUPABASE_URL ??= 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY ??= 'sb_secret_test';

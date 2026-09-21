-- 012_user_deactivation.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 001).
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/012_user_deactivation.sql
--
-- Sau đó: pnpm prisma:generate. PHẢI chạy TRƯỚC khi deploy BE: Prisma liệt kê
-- cột tường minh nên client mới sẽ SELECT deactivated_at và lỗi nếu cột chưa có.
-- Cột additive, nullable — BE cũ vẫn chạy được.
--
-- VÌ SAO: admin cần chặn một tài khoản (đăng ký rác, người ngoài họ, tài khoản
-- bị lộ mật khẩu) mà KHÔNG xoá nó — xoá thì mất dấu ai từng có quyền gì.
--   - deactivated_at NULL  ⇔ đang hoạt động;
--   - khác NULL            ⇔ bị khoá: login trả 403, token đang cầm trả 401
--                            ngay ở JwtStrategy (không chờ hết TTL 1 ngày).
--   - deactivated_by       admin đã khoá — ai chịu trách nhiệm cho thay đổi.

BEGIN;

ALTER TABLE user_metadata
  ADD COLUMN IF NOT EXISTS deactivated_at timestamp(3),
  ADD COLUMN IF NOT EXISTS deactivated_by uuid;

COMMIT;

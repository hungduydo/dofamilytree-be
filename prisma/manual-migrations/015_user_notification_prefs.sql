-- 015_user_notification_prefs.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 001).
--
--   pnpm db:backup
--   psql "$DIRECT_URL" -f prisma/manual-migrations/015_user_notification_prefs.sql
--
-- Sau đó: pnpm prisma:generate. PHẢI chạy TRƯỚC khi deploy BE: Prisma liệt kê
-- cột tường minh, nên MỌI truy vấn user_metadata không có `select` (đăng nhập,
-- JwtStrategy…) sẽ SELECT cột mới và lỗi nếu cột chưa có. Additive, có default —
-- BE cũ vẫn chạy.
--
-- VÌ SAO: email nhắc ngày giỗ (src/notifications/) là email ĐỊNH KỲ. Người nhận
-- phải tắt được bằng một cú bấm (link trong email + header List-Unsubscribe —
-- Gmail/Yahoo từ chối thư hàng loạt thiếu nó), và lựa chọn đó phải được nhớ.
-- Mặc định BẬT: thành viên đã được duyệt vào dòng họ là người muốn biết ngày giỗ
-- của ông bà mình.

BEGIN;

ALTER TABLE user_metadata
  ADD COLUMN IF NOT EXISTS anniversary_reminders boolean NOT NULL DEFAULT true;

COMMIT;

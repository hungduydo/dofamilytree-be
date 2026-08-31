-- 007_contact_backoffice.sql — Bổ sung cho màn hình /bo/contact
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 006_contact.sql).
--
-- Cách chạy:
--   psql "$DIRECT_URL" -f prisma/manual-migrations/007_contact_backoffice.sql
--   pnpm prisma:generate
--
-- Chỉ THÊM cột và index vào contact_message. Không đụng dữ liệu có sẵn, không
-- đụng bảng nào khác. An toàn chạy lại nhiều lần.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CỘT KIỂM TOÁN — ai xử lý, lúc nào, ghi chú gì
--
-- api-contact.md §6.1: PATCH trước đây chỉ nhận `status`, nên "ANSWERED" mà
-- không biết ai trả lời thì với một ban liên lạc bốn người là không hành động
-- được. Thêm sớm vì retrofit vào UI sau khó hơn nhiều.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE contact_message
  -- KHÔNG có FK sang "User" — cùng lý do như cột user_id (xem 006). Bảng
  -- public."User" trống; danh tính thật nằm ở auth.users của Supabase.
  ADD COLUMN IF NOT EXISTS handled_by   uuid,
  ADD COLUMN IF NOT EXISTS handled_at   timestamp(3),
  -- Ghi chú NỘI BỘ. Không bao giờ được trả về route public.
  ADD COLUMN IF NOT EXISTS handled_note varchar(2000);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. updated_at
--
-- Prisma ánh xạ `@updatedAt` thành cột NOT NULL KHÔNG có default (giá trị do
-- client sinh). Nhưng bảng đã có dữ liệu, nên không thể ADD COLUMN NOT NULL
-- thẳng — phải qua ba bước: thêm nullable, lấp dòng cũ, rồi mới siết NOT NULL.
--
-- Lấp bằng `created_at` chứ không phải now(): một lá thư chưa ai đụng tới thì
-- "lần sửa gần nhất" ĐÚNG BẰNG lúc nó được gửi. Dùng now() sẽ làm mọi thư cũ
-- nhảy lên đầu danh sách "vừa xử lý gần nhất" ngay sau khi chạy migration.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE contact_message ADD COLUMN IF NOT EXISTS updated_at timestamp(3);
UPDATE contact_message SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE contact_message ALTER COLUMN updated_at SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INDEX CHO TÌM KIẾM THEO MÃ THAM CHIẾU
--
-- api-contact.md §6.1 gọi đây là lỗi PHÁ VỠ QUY TRÌNH: người nhà đọc
-- "LH-2608-0431" qua điện thoại, và người trực không có cách nào tìm ra ngoài
-- lật từng trang hộp thư — tức là mã tham chiếu chỉ để trang trí.
--
-- reference_code đã có UNIQUE index (006), phục vụ tra cứu CHÍNH XÁC. Index
-- dưới đây phục vụ tìm kiếm CHỨA (ILIKE '%...%') trên ba cột người trực gõ vào
-- ô tìm kiếm. pg_trgm đã được bật sẵn cho members_name_trgm_idx (002), nên
-- không cần CREATE EXTENSION.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS contact_message_reference_code_trgm_idx
  ON contact_message USING gin (reference_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS contact_message_full_name_trgm_idx
  ON contact_message USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS contact_message_phone_trgm_idx
  ON contact_message USING gin (phone gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. KIỂM CHỨNG SAU KHI CHẠY
-- ─────────────────────────────────────────────────────────────────────────────
--
--   \d+ contact_message
--   -- PHẢI thấy handled_by, handled_at, handled_note, updated_at (NOT NULL)
--
--   -- Không dòng nào được để trống updated_at:
--   SELECT count(*) FROM contact_message WHERE updated_at IS NULL;  -- 0
--
-- LƯU Ý: 'DELETED' là giá trị mới của cột `status` (xoá mềm). Không có
-- constraint nào dưới DB liệt kê các trạng thái — allowlist nằm ở
-- CONTACT_STATUSES trong contact.constants.ts, đúng như 006 đã làm với topic.

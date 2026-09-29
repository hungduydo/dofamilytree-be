-- 014_audit_log.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 001).
--
--   pnpm db:backup   # hoặc chạy tay workflow "Database backup" — LUÔN làm trước
--   psql "$DIRECT_URL" -f prisma/manual-migrations/014_audit_log.sql
--
-- Sau đó: pnpm prisma:generate. PHẢI chạy TRƯỚC khi deploy BE: mọi lần ghi
-- member / quan hệ giờ ghi kèm một dòng audit TRONG CÙNG transaction — bảng
-- chưa có thì lần ghi đó lỗi và rollback. Bảng mới, additive — BE cũ vẫn chạy.
--
-- VÌ SAO: editor là nhân sự thuê ngoài nhưng sửa được mọi member, và xoá member
-- là xoá hẳn. Không có dấu vết ai sửa gì, không có cách lấy lại một người lỡ
-- xoá — trong khi một cạnh cha/con sai lặng lẽ làm sai thế hệ của cả nhánh.
--
--   entity_type  'member' | 'relationship' (hằng số ở src/audit/audit-record.ts;
--                cố ý KHÔNG CHECK để thêm loại mới không cần migrate).
--   action       CREATE | UPDATE | DELETE | RESTORE.
--   before/after UPDATE: chỉ các field ĐỔI. DELETE: `before` là snapshot ĐỦ để
--                khôi phục (member + profile + các dòng bị cascade/SetNull).
--   restored_*   chỉ có ý nghĩa với dòng DELETE: đã khôi phục từ thùng rác.
--
-- Chứa PII (phone/email/địa chỉ trong profile) — chỉ admin đọc được qua API.

BEGIN;

CREATE TABLE IF NOT EXISTS audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text        NOT NULL,
  entity_id    uuid        NOT NULL,
  action       text        NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE')),
  actor_id     uuid,
  summary      text,
  before       jsonb,
  after        jsonb,
  created_at   timestamp(3) NOT NULL DEFAULT now(),
  restored_at  timestamp(3),
  restored_by  uuid
);

-- Lịch sử của MỘT bản ghi (trang chi tiết member).
CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON audit_log (entity_type, entity_id, created_at DESC);

-- Dòng thời gian toàn hệ thống, phân trang keyset.
CREATE INDEX IF NOT EXISTS audit_log_created_idx
  ON audit_log (created_at DESC, id DESC);

-- "Ai đã sửa gì" — lọc theo người sửa.
CREATE INDEX IF NOT EXISTS audit_log_actor_idx
  ON audit_log (actor_id, created_at DESC);

-- Thùng rác: chỉ các lần xoá chưa khôi phục. Partial nên rất nhỏ.
CREATE INDEX IF NOT EXISTS audit_log_trash_idx
  ON audit_log (created_at DESC)
  WHERE action = 'DELETE' AND restored_at IS NULL;

COMMIT;

-- KIỂM CHỨNG:
--   \d audit_log
--   SELECT indexname FROM pg_indexes WHERE tablename = 'audit_log';  -- 5 (kể cả pkey)
--
-- HOÀN TÁC: DROP TABLE audit_log;  (mất toàn bộ lịch sử — backup trước)

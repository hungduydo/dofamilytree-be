-- 016_drop_v1_tables.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 001).
--
-- ĐIỀU KIỆN (kiểm TRƯỚC khi chạy):
--   1. Backend v1 (Express) đã TẮT HẲN — không deploy nào còn đọc/ghi hai bảng này.
--   2. 014_audit_log.sql đã áp (verify-restore.sh coi 23 bảng là sàn).
--   3. Backup vừa chạy xong:  pnpm db:backup  (hoặc workflow "Database backup").
--   4. Hai bảng thật sự không còn dữ liệu cần giữ:
--        SELECT count(*) FROM relationships;  -- mong đợi 0 (quan hệ ở member_relationships)
--        SELECT count(*) FROM comments;       -- mong đợi 0 (không route v2 nào ghi)
--      KHÁC 0 ⇒ DỪNG, xuất ra CSV trước:
--        \copy relationships TO 'relationships-v1.csv' CSV HEADER
--        \copy comments      TO 'comments-v1.csv'      CSV HEADER
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/016_drop_v1_tables.sql
--
-- Sau đó: pnpm prisma:generate (model Relationship / Comment / enum
-- RelationshipType đã bỏ khỏi schema.prisma). Deploy BE mới TRƯỚC hay SAU file
-- này đều được: BE v2 không còn đọc hai bảng này.
--
-- VÌ SAO: di sản của v1. `relationships` (PARENT/CHILD/SPOUSE) đã chuyển hết sang
-- `member_relationships` (script migrate-relationships.ts, đã gỡ). `comments` có
-- FK author_id → "User" — bảng neo luôn rỗng — nên v2 chưa từng ghi được vào.
-- Giữ lại chỉ làm schema khó đọc, và `prisma db pull` cứ kéo chúng về lại.

BEGIN;

DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS relationships;
DROP TYPE IF EXISTS "RelationshipType";

COMMIT;

-- KIỂM CHỨNG:
--   SELECT to_regclass('public.relationships'), to_regclass('public.comments');  -- cả hai NULL
--
-- HOÀN TÁC: khôi phục hai bảng từ backup (docs/BACKUP_RESTORE.md, restore theo bảng).

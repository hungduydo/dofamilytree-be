-- 013_members_drop_redundant_indexes.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 001).
--
-- PHẢI dùng DIRECT_URL: DROP INDEX CONCURRENTLY không chạy được trong
-- transaction / qua pgbouncer transaction mode.
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/013_members_drop_redundant_indexes.sql
--
-- Sau đó: pnpm prisma:generate (các @@index tương ứng đã bỏ khỏi schema.prisma).
--
-- VÌ SAO: members có 479 dòng / 104 kB heap nhưng 13 index ~900 kB. Số liệu
-- pg_stat_user_indexes lúc viết (2026-09-22):
--   - members_tree_created_at_idx    0 lần dùng.
--   - members_gender_created_at_idx  0 lần dùng.
--   - members_normalized_name_idx    btree: đọc 0 dòng. nameSearchWhere() sinh
--     ILIKE '%x%' — chỉ members_normalized_name_trgm_idx (GIN) phục vụ được.
--   - members_life_status_idx        cột chỉ 2 giá trị (ALIVE 284 / DECEASED 195),
--     mỗi lần filter ra 40–60% bảng ⇒ seq scan rẻ ngang/hơn. EXPLAIN ANALYZE có
--     vs không index đều < 1 ms. Ban thờ vẫn dùng members_deceased_order_idx_v2.
-- Bớt index cũng giảm chi phí ghi (mỗi UPDATE cột được index phải sửa mọi index
-- chứa nó và mất HOT update).
--
-- HOÀN TÁC: chạy lại các CREATE INDEX tương ứng trong 002 / 008.

DROP INDEX CONCURRENTLY IF EXISTS members_tree_created_at_idx;
DROP INDEX CONCURRENTLY IF EXISTS members_gender_created_at_idx;
DROP INDEX CONCURRENTLY IF EXISTS members_normalized_name_idx;
DROP INDEX CONCURRENTLY IF EXISTS members_life_status_idx;

-- KIỂM CHỨNG:
--   SELECT indexrelname FROM pg_stat_user_indexes WHERE relname = 'members';
--   -- còn 9 index, không còn 4 cái trên.

-- 008_member_life_status.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 001).
--
-- Cách chạy (PHẢI dùng DIRECT_URL — CREATE/DROP INDEX CONCURRENTLY không chạy
-- được trong transaction / qua pgbouncer transaction mode):
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/008_member_life_status.sql
--
-- Sau đó: pnpm prisma:generate, rồi backfill:
--   pnpm backfill:life-status -- --dry-run
--   pnpm backfill:life-status
--
-- PHẢI chạy file này TRƯỚC khi deploy BE: Prisma liệt kê cột tường minh nên
-- client mới sẽ SELECT life_status và lỗi nếu cột chưa có.
--
-- VÌ SAO: "đã khuất" trước đây suy từ members."deathDate" (String tự do). Tổ
-- tiên các đời đầu đã mất nhưng không ai biết ngày ⇒ bị đếm là còn sống, không
-- lên ban thờ, thống kê sai. Trạng thái giờ lưu tường minh; deathDate chỉ còn
-- là thông tin phụ.
--
-- CẢNH BÁO PHỐI HỢP VỚI V1: cột additive + có DEFAULT nên insert từ v1 vẫn chạy
-- (nhận UNKNOWN). Nhưng `prisma migrate dev` / `db push` từ repo v1 sẽ coi cột
-- này là drift và đề nghị DROP — phải thêm vào schema.prisma của v1.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CỘT
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS life_status text NOT NULL DEFAULT 'UNKNOWN';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_life_status_check'
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT members_life_status_check
      CHECK (life_status IN ('ALIVE', 'DECEASED', 'UNKNOWN'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INDEX
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Thay members_deceased_order_idx (005_memorial.sql). Mệnh đề WHERE phải khớp
-- CHÍNH XÁC với DECEASED_WHERE trong src/members/life-status.ts — lệch một bên
-- ⇒ Postgres không dùng được index và query ban thờ rơi về seq scan.
-- Cột giữ nguyên thứ tự orderBy của MemorialService.getAncestors.

CREATE INDEX CONCURRENTLY IF NOT EXISTS members_deceased_order_idx_v2
  ON members (generation, "deathDate", name, id)
  WHERE life_status = 'DECEASED';

DROP INDEX CONCURRENTLY IF EXISTS members_deceased_order_idx;

-- Phục vụ GET /v2/members?lifeStatus=... và groupBy ở thống kê.
CREATE INDEX CONCURRENTLY IF NOT EXISTS members_life_status_idx
  ON members (life_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. KIỂM CHỨNG
-- ─────────────────────────────────────────────────────────────────────────────
--
--   \d+ members
--
--   SELECT life_status, count(*) FROM members GROUP BY 1;
--
--   EXPLAIN ANALYZE
--   SELECT id, name, "birthDate", "deathDate", generation, avatar_url
--   FROM members WHERE life_status = 'DECEASED'
--   ORDER BY generation, "deathDate", name, id LIMIT 6;
--   -- PHẢI thấy: Index Scan using members_deceased_order_idx_v2

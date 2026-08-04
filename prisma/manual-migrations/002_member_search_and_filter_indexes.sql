-- 002_member_search_and_filter_indexes.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này.
-- Repo v2 không sở hữu prisma/migrations; migration lịch sử chạy từ repo v1
-- (`cd ../backend && prisma migrate dev`). File này ghi lại chính xác DDL đã
-- áp thủ công lên Supabase để repo v1 có thể đồng bộ lại sau.
--
-- Cách chạy (PHẢI dùng DIRECT_URL, không phải DATABASE_URL — CREATE INDEX
-- CONCURRENTLY không chạy được trong transaction / qua pgbouncer transaction mode):
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/002_member_search_and_filter_indexes.sql
--
-- Sau đó: pnpm prisma:generate
-- Kiểm chứng schema khớp DB:
--   pnpm exec prisma migrate diff \
--     --from-schema-datasource prisma/schema.prisma \
--     --to-schema-datamodel   prisma/schema.prisma
--
-- CẢNH BÁO PHỐI HỢP VỚI V1: toàn bộ file này chỉ THÊM index (không đổi cột) nên
-- Prisma client của v1 vẫn chạy bình thường. NHƯNG lần sau ai chạy
-- `prisma migrate dev` / `db push` từ repo v1, Prisma sẽ coi mọi index dưới đây
-- là drift và đề nghị DROP. Phải thêm các @@index tương ứng vào schema.prisma
-- của v1 ngay khi tiếp cận được repo đó.
--
-- CẢNH BÁO 2 — index KHÔNG biểu diễn được bằng Prisma:
--   * index PHẦN (partial, có mệnh đề WHERE) — Prisma không hỗ trợ ở bất kỳ
--     phiên bản nào. Các index có WHERE dưới đây chỉ tồn tại trong SQL; trong
--     schema.prisma chỉ có comment ghi lại. `migrate diff` sẽ KHÔNG thấy chúng.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TÌM KIẾM THEO TÊN (pg_trgm)
-- ─────────────────────────────────────────────────────────────────────────────
-- nameSearchWhere() sinh ra `ILIKE '%x%'` trên CẢ HAI cột. Btree thường
-- (members_normalized_name_idx / members_name_idx đang có) KHÔNG phục vụ được
-- wildcard đầu chuỗi — chỉ GIN trigram mới làm được. Phải index cả hai cột, nếu
-- không thì nhánh OR còn lại vẫn seq scan và cả câu truy vấn vẫn seq scan.
--
-- Nếu dòng CREATE EXTENSION báo "permission denied": bật pg_trgm ở
-- Supabase Dashboard → Database → Extensions → pg_trgm, rồi chạy lại file (dòng
-- này thành no-op).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX CONCURRENTLY IF NOT EXISTS members_normalized_name_trgm_idx
  ON members USING gin (normalized_name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS members_name_trgm_idx
  ON members USING gin (name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LỌC + SẮP XẾP CHO GET /v2/members
-- ─────────────────────────────────────────────────────────────────────────────
-- Sắp xếp mặc định là `created_at DESC, id ASC` mà created_at CHƯA hề có index —
-- đây là index có lợi nhất trong file này (lần mở trang đầu tiên của bảng BO).
-- Cũng phục vụ luôn điều kiện `created_at >= monthStart` trong getMemberStats.
CREATE INDEX CONCURRENTLY IF NOT EXISTS members_created_at_id_idx
  ON members (created_at DESC, id);

-- Lọc theo thế hệ + sắp xếp mặc định, phục vụ trong MỘT index scan.
-- (members_generation_idx từ 001 vẫn giữ: nó phục vụ đường ORDER BY generation.)
CREATE INDEX CONCURRENTLY IF NOT EXISTS members_generation_created_at_idx
  ON members (generation, created_at DESC, id);

-- Lọc theo chi nhánh (?tree_id=) + sắp xếp mặc định.
CREATE INDEX CONCURRENTLY IF NOT EXISTS members_tree_created_at_idx
  ON members (tree_id, created_at DESC, id);

-- Lọc theo giới tính (?gender=) + sắp xếp mặc định. gender chỉ có ~4 giá trị nên
-- index đứng một mình vô dụng; giá trị nằm ở phần đuôi sắp xếp của index tổ hợp.
CREATE INDEX CONCURRENTLY IF NOT EXISTS members_gender_created_at_idx
  ON members (gender, created_at DESC, id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. COMMITTEE / NOTABLE (chuẩn bị cho Phase 2)
-- ─────────────────────────────────────────────────────────────────────────────
-- Index PHẦN, rất nhỏ. Hiện CHƯA dùng — predicate vẫn đang là `notes ILIKE` /
-- `biography <> ''`. Chỉ có tác dụng sau khi backfill xong và đổi predicate sang
-- cột boolean. KHÔNG biểu diễn được bằng Prisma @@index (xem CẢNH BÁO 2).
CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_is_committee_idx
  ON profiles (member_id) WHERE "isCommittee";

CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_is_notable_idx
  ON profiles (member_id) WHERE "isNotable";

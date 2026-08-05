-- 003_media_library_indexes.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 002_*.sql).
-- Repo v2 KHÔNG sở hữu prisma/migrations; file này ghi lại chính xác DDL đã áp
-- thủ công lên Supabase để repo v1 có thể đồng bộ lại sau.
--
-- Cách chạy (PHẢI dùng DIRECT_URL, không phải DATABASE_URL — CREATE INDEX
-- CONCURRENTLY không chạy được trong transaction / qua pgbouncer transaction mode):
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/003_media_library_indexes.sql
--
-- Sau đó: pnpm prisma:generate
-- Kiểm chứng schema khớp DB:
--   pnpm exec prisma migrate diff \
--     --from-schema-datasource prisma/schema.prisma \
--     --to-schema-datamodel   prisma/schema.prisma
--
-- CẢNH BÁO PHỐI HỢP VỚI V1: file này THÊM cột + index cho bảng `media`. Các cột
-- thêm đều nullable / có default nên Prisma client của v1 vẫn chạy. Nhưng lần
-- sau ai chạy `prisma migrate dev` / `db push` từ repo v1, Prisma sẽ coi các
-- cột/index dưới đây là drift và đề nghị DROP — phải thêm tương ứng vào
-- schema.prisma của v1 ngay khi tiếp cận được repo đó.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CỘT MỚI CHO `media`
-- ─────────────────────────────────────────────────────────────────────────────
-- normalized_title  — tên bỏ dấu, phục vụ tìm kiếm VN-insensitive.
-- mime_type         — MIME gốc (image/jpeg, video/mp4…).
-- tags              — mảng tag (lọc theo tag).
-- duration_seconds  — thời lượng video/audio (FE gửi lúc upload).
-- event_id          — FK tới events (lọc theo sự kiện).
-- status            — pending | ready | failed (fix record kẹt khi job lỗi).
ALTER TABLE media ADD COLUMN IF NOT EXISTS normalized_title text;
ALTER TABLE media ADD COLUMN IF NOT EXISTS mime_type        text;
ALTER TABLE media ADD COLUMN IF NOT EXISTS tags             text[] NOT NULL DEFAULT '{}';
ALTER TABLE media ADD COLUMN IF NOT EXISTS duration_seconds integer;
ALTER TABLE media ADD COLUMN IF NOT EXISTS event_id         uuid;
ALTER TABLE media ADD COLUMN IF NOT EXISTS status           text   NOT NULL DEFAULT 'pending';

-- FK event_id → events(id). Thêm có điều kiện để chạy lại file là no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'media_event_id_fkey' AND table_name = 'media'
  ) THEN
    ALTER TABLE media
      ADD CONSTRAINT media_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES events(id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. BACKFILL DỮ LIỆU CŨ
-- ─────────────────────────────────────────────────────────────────────────────
-- Record đã có URL Blob thật (file_path https://…) coi như đã sẵn sàng.
UPDATE media SET status = 'ready' WHERE file_path LIKE 'https://%' AND status <> 'ready';
-- normalized_title best-effort: hạ chữ thường (bỏ dấu đầy đủ do app xử lý ở
-- lần ghi sau; lower() đủ cho ILIKE khớp phần lớn trường hợp cũ).
UPDATE media SET normalized_title = lower(title) WHERE normalized_title IS NULL AND title IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INDEX — LỌC + SẮP XẾP + TÌM KIẾM
-- ─────────────────────────────────────────────────────────────────────────────
-- pg_trgm đã bật từ 002_*.sql. Nếu chưa, bỏ comment dòng dưới:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Các index đơn cũ (uploader_id / member_id / album_id) được thay bằng composite
-- có đuôi (created_at DESC, id) để phục vụ luôn sắp xếp mặc định của list.
DROP INDEX CONCURRENTLY IF EXISTS media_uploader_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS media_member_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS media_album_id_idx;

-- Sắp xếp mặc định + phân trang (GET /v2/media). Cũng phục vụ COUNT/stats theo created_at.
CREATE INDEX CONCURRENTLY IF NOT EXISTS media_created_at_id_idx
  ON media (created_at DESC, id);

-- Tab loại (?type=image|video|audio|document) + sắp xếp mặc định trong MỘT scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS media_type_created_at_idx
  ON media (type, created_at DESC, id);

-- "Media được xem nhiều" (?sortBy=views).
CREATE INDEX CONCURRENTLY IF NOT EXISTS media_views_idx
  ON media (views DESC, id);

-- Lọc theo sự kiện (?event_id=) + sắp xếp mặc định.
CREATE INDEX CONCURRENTLY IF NOT EXISTS media_event_created_at_idx
  ON media (event_id, created_at DESC, id);

-- Lọc theo album (?album_id=) + sắp xếp mặc định.
CREATE INDEX CONCURRENTLY IF NOT EXISTS media_album_created_at_idx
  ON media (album_id, created_at DESC, id);

-- Lọc theo người đăng (?uploader_id=) + sắp xếp mặc định.
CREATE INDEX CONCURRENTLY IF NOT EXISTS media_uploader_created_at_idx
  ON media (uploader_id, created_at DESC, id);

-- Tài liệu/ảnh của một thành viên (GET /v2/media/member/:id) + sắp xếp mặc định.
CREATE INDEX CONCURRENTLY IF NOT EXISTS media_member_created_at_idx
  ON media (member_id, created_at DESC, id);

-- Tìm kiếm theo tên (nameSearchWhere sinh ILIKE '%x%') — chỉ GIN trigram phục vụ
-- được wildcard đầu chuỗi. Index cả normalized_title.
CREATE INDEX CONCURRENTLY IF NOT EXISTS media_normalized_title_trgm_idx
  ON media USING gin (normalized_title gin_trgm_ops);

-- Lọc theo tag (?tag=) — array containment `tags @> ARRAY[...]`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS media_tags_gin_idx
  ON media USING gin (tags);

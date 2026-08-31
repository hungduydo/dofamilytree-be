-- 005_memorial.sql — Góc nhớ tổ tiên (Ancestor Memorial)
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 002_*.sql).
-- Repo v2 KHÔNG sở hữu prisma/migrations; file này ghi lại chính xác DDL đã áp
-- thủ công lên Supabase để repo v1 có thể đồng bộ lại sau.
--
-- Cách chạy (PHẢI dùng DIRECT_URL, không phải DATABASE_URL — CREATE INDEX
-- CONCURRENTLY không chạy được trong transaction / qua pgbouncer transaction mode):
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/005_memorial.sql
--
-- Sau đó: pnpm prisma:generate
-- Kiểm chứng schema khớp DB:
--   pnpm exec prisma migrate diff \
--     --from-schema-datasource prisma/schema.prisma \
--     --to-schema-datamodel   prisma/schema.prisma
--
-- CẢNH BÁO PHỐI HỢP VỚI V1: file này THÊM hai bảng mới (không đụng bảng nào có
-- sẵn) cộng MỘT index trên `members`. Prisma client của v1 vẫn chạy bình thường.
-- Nhưng lần sau ai chạy `prisma migrate dev` / `db push` từ repo v1, Prisma sẽ
-- coi hai bảng và index dưới đây là drift và đề nghị DROP — phải thêm tương ứng
-- vào schema.prisma của v1 ngay khi tiếp cận được repo đó.
--
-- LƯU Ý VỀ DRIFT NGAY TRONG REPO NÀY: ba partial index ở mục 3 và 4 KHÔNG diễn
-- đạt được bằng Prisma schema (Prisma chưa hỗ trợ partial / `WHERE`). Chúng chỉ
-- tồn tại ở đây, đúng tiền lệ profiles_is_committee_idx trong 002_*.sql. Vì thế
-- `migrate diff` sẽ KHÔNG thấy chúng — đừng tưởng chúng thừa mà xoá.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. BẢNG memorial_incense — mỗi dòng là một nén hương
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memorial_incense (
  -- KHÔNG có DEFAULT: Prisma sinh uuid ở phía client (@default(uuid())) và coi
  -- một DEFAULT dưới DB là drift.
  id         uuid PRIMARY KEY,
  -- NULL = thắp cho tổ tiên nói chung (nút "Thắp hương" ở ban thờ). Lượt này
  -- CỐ Ý không được quy cho cá nhân nào khi đếm incenseCount.
  member_id  uuid REFERENCES members(id) ON DELETE CASCADE ON UPDATE CASCADE,
  -- KHÔNG có FK. Bảng public."User" mà Prisma ánh xạ tới đang TRỐNG (0 dòng);
  -- danh tính thật nằm ở auth.users của Supabase. Bảng `memories` có
  -- FK author_id -> "User"(id) và vì thế MỌI insert vào nó đều vi phạm FK
  -- (memories cũng đang trống). Đừng lặp lại ở đây.
  user_id    uuid NOT NULL,
  -- Ngày theo giờ VN, do APP ghi (Intl.DateTimeFormat + Asia/Ho_Chi_Minh).
  -- KHÔNG đặt DEFAULT CURRENT_DATE: Postgres chạy UTC, sau 17h giờ VN sẽ ghi
  -- nhầm sang ngày hôm sau và giới hạn mỗi-ngày lệch một múi.
  offered_on date NOT NULL,
  -- timestamp(3) chứ KHÔNG phải timestamptz: đó là thứ Prisma ánh xạ DateTime
  -- sang, và là kiểu mọi bảng khác trong repo đang dùng (memories, media).
  -- Dùng timestamptz thì `migrate diff` báo drift ở mọi lần chạy.
  created_at timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memorial_incense_member_id_idx
  ON memorial_incense (member_id);

CREATE INDEX IF NOT EXISTS memorial_incense_user_created_idx
  ON memorial_incense (user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. BẢNG memorial_tribute — lời tưởng niệm
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memorial_tribute (
  -- KHÔNG có DEFAULT — xem mục 1.
  id          uuid PRIMARY KEY,
  content     varchar(500) NOT NULL,
  -- NULL = gửi tổ tiên nói chung. SET NULL (không phải CASCADE) khi member bị
  -- xoá: lời người ta viết không được biến mất theo.
  member_id   uuid REFERENCES members(id) ON DELETE SET NULL ON UPDATE CASCADE,
  -- KHÔNG có FK — cùng lý do như memorial_incense ở mục 1.
  user_id     uuid NOT NULL,
  -- Tên tác giả chốt lúc ghi — xem chú thích model trong schema.prisma.
  author_name text NOT NULL,
  created_at  timestamp(3) NOT NULL DEFAULT now()
);

-- Trang chủ đọc "5 lời gần nhất": ORDER BY created_at DESC, id DESC + LIMIT.
CREATE INDEX IF NOT EXISTS memorial_tribute_created_id_idx
  ON memorial_tribute (created_at DESC, id DESC);

-- Lọc theo một cụ, vẫn mới nhất trước. Phục vụ cả WHERE lẫn ORDER BY.
CREATE INDEX IF NOT EXISTS memorial_tribute_member_created_idx
  ON memorial_tribute (member_id, created_at DESC, id DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. GIỚI HẠN 1 LƯỢT / USER / NGƯỜI NHẬN / NGÀY
--
-- Ép ở TẦNG DB chứ không phải trong service: không tốn round-trip kiểm tra
-- trước, và hai request đồng thời không lách qua được (SELECT-rồi-INSERT thì
-- có). Service bắt lỗi Prisma P2002 và trả 409.
--
-- PHẢI tách làm HAI index. Postgres coi NULL là khác nhau trong UNIQUE, nên
-- UNIQUE(user_id, member_id, offered_on) sẽ KHÔNG chặn được lượt clan-wide
-- (member_id IS NULL) — mỗi lần bấm lại lọt thêm một dòng.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS memorial_incense_user_member_day_uniq
  ON memorial_incense (user_id, member_id, offered_on)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS memorial_incense_user_clan_day_uniq
  ON memorial_incense (user_id, offered_on)
  WHERE member_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. INDEX CHO DANH SÁCH TỔ TIÊN
--
-- GET /v2/memorial/ancestors chạy:
--   WHERE "deathDate" IS NOT NULL AND "deathDate" <> ''
--   ORDER BY generation NULLS LAST, "deathDate", name, id
-- `deathDate` trước nay CHƯA có index nào ⇒ thiếu index này là seq-scan toàn
-- bảng members cho mọi lượt mở trang.
--
-- MỆNH ĐỀ WHERE PHẢI KHỚP CHÍNH XÁC DECEASED_WHERE trong memorial.service.ts.
-- Chuỗi rỗng không phải chuyện lý thuyết: tại thời điểm viết, 12/480 member có
-- "deathDate" = '' (form v1 gửi chuỗi rỗng thay vì bỏ trống) và tất cả đều còn
-- sống. Chỉ lọc IS NOT NULL là gần một nửa danh sách tổ tiên thành người đang
-- sống. Lệch một bên ⇒ Postgres không dùng được index và query rơi về seq scan.
--
-- Partial vì đó chính là định nghĩa "tổ tiên": index chỉ chứa 13 người đã khuất
-- thay vì cả 480 dòng.
-- ASC mặc định của Postgres LÀ NULLS LAST ⇒ khớp đúng orderBy ở trên, nên index
-- phục vụ được cả lọc, sắp xếp lẫn phân trang mà không cần bước sort.
--
-- `deathDate`/`name` phải để trong nháy kép: chúng là camelCase trong DB.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS members_deceased_order_idx
  ON members (generation, "deathDate", name, id)
  WHERE "deathDate" IS NOT NULL AND "deathDate" <> '';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. KIỂM CHỨNG SAU KHI CHẠY
-- ─────────────────────────────────────────────────────────────────────────────
--
--   \d+ memorial_incense
--   \d+ memorial_tribute
--
--   EXPLAIN ANALYZE
--   SELECT id, name, "birthDate", "deathDate", generation, avatar_url
--   FROM members WHERE "deathDate" IS NOT NULL AND "deathDate" <> ''
--   ORDER BY generation, "deathDate", name, id LIMIT 6;
--   -- PHẢI thấy: Index Scan using members_deceased_order_idx
--   -- KHÔNG được thấy: Seq Scan on members

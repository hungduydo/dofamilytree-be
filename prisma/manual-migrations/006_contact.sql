-- 006_contact.sql — Liên hệ Ban liên lạc (Contact)
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 002_*.sql,
-- 005_memorial.sql). Repo v2 KHÔNG sở hữu prisma/migrations; file này ghi lại
-- CHÍNH XÁC phần DDL đã áp thủ công lên Supabase để repo v1 đồng bộ lại sau.
--
-- Cách chạy (PHẢI dùng DIRECT_URL — CREATE INDEX CONCURRENTLY không chạy được
-- trong transaction / qua pgbouncer transaction mode):
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/006_contact.sql
--
-- Sau đó: pnpm prisma:generate
-- Kiểm chứng schema khớp DB:
--   pnpm exec prisma migrate diff \
--     --from-schema-datasource prisma/schema.prisma \
--     --to-schema-datamodel   prisma/schema.prisma
--
-- CẢNH BÁO PHỐI HỢP VỚI V1: file này chỉ THÊM bốn bảng mới, không đụng bảng nào
-- có sẵn. Prisma client của v1 vẫn chạy bình thường. Nhưng lần sau ai chạy
-- `prisma migrate dev` / `db push` từ repo v1, Prisma sẽ coi bốn bảng dưới đây
-- là drift và đề nghị DROP — phải thêm tương ứng vào schema.prisma của v1 ngay
-- khi tiếp cận được repo đó.
--
-- LƯU Ý VỀ DRIFT NGAY TRONG REPO NÀY: CHECK constraint ở mục 1
-- (contact_info_singleton_chk) KHÔNG diễn đạt được bằng Prisma schema — Prisma
-- chưa hỗ trợ CHECK. Nó chỉ tồn tại ở đây, đúng tiền lệ ba partial index trong
-- 005_memorial.sql. Vì thế `migrate diff` sẽ KHÔNG thấy nó — đừng tưởng thừa
-- mà xoá: nó là thứ duy nhất chặn dòng contact_info thứ hai dưới tầng DB.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. BẢNG contact_info — SINGLETON: thông tin liên hệ của dòng họ
--
-- `id` là text (không phải uuid) và luôn mang giá trị 'default'. CHECK ép cứng
-- điều đó: service upsert theo id='default', nên một dòng thứ hai lọt vào đây
-- sẽ không bao giờ được đọc mà chỉ âm thầm giữ dữ liệu ma. Thà chặn ở DB.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_info (
  -- CÓ DEFAULT ở đây, KHÁC với các bảng trong 005_memorial.sql — và khác biệt
  -- này là thật, không phải nhầm. `@default(uuid())` là hàm Prisma chạy phía
  -- client nên DB không được có default; `@default("default")` là một HẰNG CHUỖI
  -- nên Prisma phát sinh nó thành DEFAULT dưới DB. Bỏ dòng này đi là
  -- `migrate diff` báo drift ở mọi lần chạy.
  id            text PRIMARY KEY DEFAULT 'default',
  venue_name    text,
  venue_address text,
  venue_image   text,
  board_term    text,
  response_days integer,
  -- timestamp(3), KHÔNG phải timestamptz — đó là thứ Prisma ánh xạ DateTime
  -- sang và là kiểu mọi bảng khác trong repo đang dùng. Dùng timestamptz thì
  -- `migrate diff` báo drift ở mọi lần chạy.
  --
  -- KHÔNG có DEFAULT: `@updatedAt` là cơ chế của Prisma chạy phía client, và
  -- Prisma phát sinh cột này thành `TIMESTAMP(3) NOT NULL` trần. Thêm
  -- DEFAULT now() vào đây là drift (và cũng che mất lỗi khi có ai INSERT thẳng
  -- bằng SQL mà quên cột này).
  updated_at    timestamp(3) NOT NULL,

  CONSTRAINT contact_info_singleton_chk CHECK (id = 'default')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. BẢNG contact_channel — bốn cách liên lạc (địa chỉ / điện thoại / email / nhóm)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_channel (
  id       uuid PRIMARY KEY,
  -- CASCADE: kênh liên lạc không có nghĩa gì khi khối thông tin cha biến mất.
  info_id  text NOT NULL REFERENCES contact_info(id) ON DELETE CASCADE ON UPDATE CASCADE,
  -- 'address' | 'phone' | 'email' | 'group'. Cố ý là text chứ không phải enum
  -- Postgres: FE chốt bốn giá trị này, và enum DB buộc phải migrate mới thêm
  -- được loại thứ năm.
  type     text NOT NULL,
  label    text NOT NULL,
  value    text NOT NULL,
  href     text,
  position integer NOT NULL DEFAULT 0
);

-- GET /v2/contact/info đọc: WHERE info_id = 'default' ORDER BY position.
CREATE INDEX IF NOT EXISTS contact_channel_info_id_position_idx
  ON contact_channel (info_id, position);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. BẢNG contact_hours — giờ mở cửa nhà thờ họ
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_hours (
  id       uuid PRIMARY KEY,
  info_id  text NOT NULL REFERENCES contact_info(id) ON DELETE CASCADE ON UPDATE CASCADE,
  label    text NOT NULL,
  value    text NOT NULL,
  position integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS contact_hours_info_id_position_idx
  ON contact_hours (info_id, position);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. BẢNG contact_message — hộp thư đến của ban liên lạc
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_message (
  id             uuid PRIMARY KEY,
  -- UNIQUE là hàng phòng thủ THẬT cho mã tham chiếu, không phải trang trí: mã
  -- sinh ngẫu nhiên (LH-YYMM-4 ký tự base32) nên đụng độ là chuyện xác suất,
  -- và service dựa vào P2002 ở đây để sinh lại mã chứ không kiểm tra trước.
  reference_code text NOT NULL UNIQUE,
  topic          text NOT NULL,
  full_name      text NOT NULL,
  phone          text NOT NULL,
  email          text,
  branch         text,
  -- varchar(2000) khớp CONTACT_CONTENT_MAX_LENGTH bên FE (contactView.ts).
  content        varchar(2000) NOT NULL,
  -- [{ url, name, mimeType, size }]. jsonb chứ không phải json: Prisma ánh xạ
  -- Json sang jsonb, dùng json thì `migrate diff` báo drift.
  attachments    jsonb NOT NULL DEFAULT '[]',
  status         text NOT NULL DEFAULT 'NEW',
  -- KHÔNG có FK sang "User". Bảng public."User" mà Prisma ánh xạ tới đang TRỐNG
  -- (0 dòng); danh tính thật nằm ở auth.users của Supabase. Bảng `memories` có
  -- FK author_id -> "User"(id) và vì thế MỌI insert vào nó đều vi phạm FK.
  -- Đừng lặp lại ở đây — nhất là khi cột này chỉ là thông tin phụ.
  user_id        uuid,
  -- sha256(ip + secret), KHÔNG phải địa chỉ IP. Tồn tại để gom cụm spam khi rà
  -- soát, không phải để truy ra một con người.
  sender_ip_hash text,
  created_at     timestamp(3) NOT NULL DEFAULT now()
);

-- Hộp thư của admin: lọc theo trạng thái, mới nhất trước.
CREATE INDEX IF NOT EXISTS contact_message_status_created_at_idx
  ON contact_message (status, created_at DESC);

-- Hộp thư không lọc — cùng ORDER BY, không có WHERE.
CREATE INDEX IF NOT EXISTS contact_message_created_at_idx
  ON contact_message (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. SEED — dòng singleton PHẢI tồn tại trước khi ghi channels/hours
--
-- GET /v2/contact/info vẫn trả 200 với danh sách rỗng khi CHƯA seed (trang phân
-- biệt "họ chưa điền" với "request lỗi"), nên bước này không bắt buộc để API
-- chạy. Nhưng contact_channel.info_id có FK, nên không có dòng này thì không
-- chèn được kênh nào.
--
-- ON CONFLICT DO NOTHING: chạy lại file không được ghi đè dữ liệu clan đã sửa.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO contact_info (id, updated_at) VALUES ('default', now())
  ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. KIỂM CHỨNG SAU KHI CHẠY
-- ─────────────────────────────────────────────────────────────────────────────
--
--   \d+ contact_info
--   \d+ contact_channel
--   \d+ contact_hours
--   \d+ contact_message
--
--   -- PHẢI trả đúng 1 dòng:
--   SELECT id FROM contact_info;
--
--   -- PHẢI thấy Index Scan using contact_message_status_created_at_idx:
--   EXPLAIN ANALYZE
--   SELECT * FROM contact_message WHERE status = 'NEW'
--   ORDER BY created_at DESC LIMIT 20;

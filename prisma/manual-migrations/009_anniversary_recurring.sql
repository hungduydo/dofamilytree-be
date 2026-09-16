-- 009_anniversary_recurring.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 001).
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/009_anniversary_recurring.sql
--
-- Sau đó: pnpm prisma:generate, rồi backfill ngày kỵ từ tiểu sử:
--   pnpm backfill:death-anniversaries            (dry-run)
--   pnpm backfill:death-anniversaries -- --apply
--
-- PHẢI chạy TRƯỚC khi deploy BE: client mới SELECT kind/calendar/day/month.
-- BE cũ sẽ lỗi khi đọc bảng này sau migration (cột "date" đã bỏ) — deploy BE
-- ngay sau khi chạy. Trước đợt này không màn hình công khai nào đọc bảng.
--
-- VÌ SAO: bảng cũ lưu `date timestamp` CÓ NĂM + cờ isLunar. Ngày kỵ là ngày/tháng
-- (thường là âm lịch) lặp lại hằng năm, nên "sắp tới" so sánh theo năm không bao
-- giờ hiện lại ở năm sau, và isLunar không được quy đổi ở đâu cả.
-- Quy tắc quy đổi: docs/product/lunar-calendar.md (repo dofamilytree).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CỘT MỚI + CHUYỂN DỮ LIỆU
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE anniversaries
  ADD COLUMN IF NOT EXISTS kind          text    NOT NULL DEFAULT 'DEATH',
  ADD COLUMN IF NOT EXISTS calendar      text    NOT NULL DEFAULT 'LUNAR',
  ADD COLUMN IF NOT EXISTS day           integer,
  ADD COLUMN IF NOT EXISTS month         integer,
  ADD COLUMN IF NOT EXISTS is_leap_month boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'anniversaries' AND column_name = 'date'
  ) THEN
    -- Form BO cũ dùng ô chọn ngày dương nhưng người nhập gõ SỐ ngày/tháng âm vào
    -- đó (isLunar mặc định bật), nên giữ nguyên ngày/tháng, không quy đổi.
    UPDATE anniversaries SET
      day      = EXTRACT(DAY   FROM "date")::int,
      month    = EXTRACT(MONTH FROM "date")::int,
      calendar = CASE WHEN "isLunar" THEN 'LUNAR' ELSE 'SOLAR' END,
      kind     = CASE WHEN member_id IS NOT NULL THEN 'DEATH' ELSE 'OTHER' END
    WHERE day IS NULL;

    -- Lunar chỉ có tới ngày 30.
    UPDATE anniversaries SET day = 30 WHERE calendar = 'LUNAR' AND day > 30;

    -- Nếu một người có nhiều dòng: giữ dòng mới nhất là ngày kỵ, phần còn lại → OTHER.
    UPDATE anniversaries a SET kind = 'OTHER'
    WHERE a.kind = 'DEATH' AND EXISTS (
      SELECT 1 FROM anniversaries b
      WHERE b.member_id = a.member_id AND b.kind = 'DEATH'
        AND (b.updated_at, b.id) > (a.updated_at, a.id)
    );

    ALTER TABLE anniversaries DROP COLUMN "date", DROP COLUMN "isLunar";
  END IF;
END $$;

-- OTHER/CLAN không có member thì phải có tiêu đề.
UPDATE anniversaries SET title = 'Ngày tưởng niệm' WHERE kind <> 'DEATH' AND (title IS NULL OR title = '');

ALTER TABLE anniversaries
  ALTER COLUMN day   SET NOT NULL,
  ALTER COLUMN month SET NOT NULL,
  ALTER COLUMN title DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RÀNG BUỘC
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE anniversaries DROP CONSTRAINT IF EXISTS anniversaries_recurring_check;
ALTER TABLE anniversaries ADD CONSTRAINT anniversaries_recurring_check CHECK (
      kind IN ('DEATH', 'CLAN', 'OTHER')
  AND calendar IN ('LUNAR', 'SOLAR')
  AND month BETWEEN 1 AND 12
  AND day >= 1
  AND day <= CASE WHEN calendar = 'LUNAR' THEN 30 ELSE 31 END
  AND (calendar = 'LUNAR' OR is_leap_month = false)
  AND (kind <> 'DEATH' OR member_id IS NOT NULL)
  AND (kind = 'DEATH' OR (title IS NOT NULL AND title <> ''))
);

-- Mỗi người tối đa một ngày kỵ. EventsService bắt P2002 và trả 409.
CREATE UNIQUE INDEX IF NOT EXISTS anniversaries_death_member_uidx
  ON anniversaries (member_id) WHERE kind = 'DEATH';

CREATE INDEX IF NOT EXISTS "anniversaries_calendar_month_day_idx"
  ON anniversaries (calendar, month, day);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. KIỂM CHỨNG
-- ─────────────────────────────────────────────────────────────────────────────
--
--   \d+ anniversaries
--   SELECT kind, calendar, count(*) FROM anniversaries GROUP BY 1, 2;

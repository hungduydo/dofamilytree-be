-- 011_drop_cemetery_gps_precision.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 001).
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/011_drop_cemetery_gps_precision.sql
--
-- Chỉ cần cho DB đã từng chạy bản CŨ 010_cemetery_gps_precision.sql (trước khi
-- 010 được thay bằng 010_grave_areas.sql). Chạy trên DB sạch cũng vô hại.
--
-- VÌ SAO:
--  1. Ràng buộc cemeteries_gps_precision_check bắt mộ có toạ độ phải có
--     gps_precision. BE mới không ghi cột này nữa ⇒ mọi mộ mới có GPS bị
--     từ chối (Postgres 23514).
--  2. Mộ gps_precision = 'AREA' mang toạ độ CHÉP từ khu, không phải chấm tại
--     mộ. Theo mô hình mới, mộ chỉ có toạ độ khi đã chấm tại chính ngôi mộ;
--     vị trí của các mộ này lấy từ tâm polygon của khu (area_id).

BEGIN;

ALTER TABLE cemeteries DROP CONSTRAINT IF EXISTS cemeteries_gps_precision_check;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cemeteries' AND column_name = 'gps_precision'
  ) THEN
    -- Chỉ xoá toạ độ chép của mộ ĐÃ có khu — mộ AREA chưa gắn khu thì giữ
    -- toạ độ, kẻo mất luôn dấu vết vị trí duy nhất của nó.
    UPDATE cemeteries SET latitude = NULL, longitude = NULL
    WHERE gps_precision = 'AREA' AND area_id IS NOT NULL;

    ALTER TABLE cemeteries DROP COLUMN gps_precision;
  END IF;
END $$;

COMMIT;

-- Kiểm chứng:
--   SELECT (latitude IS NOT NULL) AS pinned, (area_id IS NOT NULL) AS in_area, count(*)
--   FROM cemeteries GROUP BY 1, 2;

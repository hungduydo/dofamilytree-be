-- 010_grave_areas.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 001).
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/010_grave_areas.sql
--
-- Sau đó: pnpm prisma:generate. PHẢI chạy TRƯỚC khi deploy BE (client mới
-- SELECT area_id / photo_url). Cột và bảng đều additive, BE cũ vẫn chạy được.
--
-- File này THAY THẾ 010_cemetery_gps_precision.sql, bản chưa từng được chạy
-- trên môi trường nào. Cột gps_precision (EXACT/AREA) bị bỏ: toạ độ khu không
-- còn được chép vào từng mộ nữa.
--
-- VÌ SAO: phần lớn mộ trong gia phả chỉ biết khu an táng ("Mộ: Đùng Vành"),
-- không biết vị trí từng ngôi. Khu giờ là một bảng riêng có polygon:
--   - mộ thuộc 0 hoặc 1 khu (area_id);
--   - mộ có latitude/longitude ⇔ đã chấm tại chính ngôi mộ;
--   - vị trí hiển thị = toạ độ mộ, không có thì tâm polygon của khu
--     (src/graves/grave-location.ts).
-- Polygon lưu jsonb [[vĩ độ, kinh độ], ...] — không cần PostGIS cho vài chục khu.

BEGIN;

CREATE TABLE IF NOT EXISTS grave_areas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  -- null = khu mới biết tên, chưa ai vẽ ranh giới.
  polygon     jsonb,
  created_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT grave_areas_polygon_check CHECK (
    polygon IS NULL OR (jsonb_typeof(polygon) = 'array' AND jsonb_array_length(polygon) >= 3)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS grave_areas_name_key ON grave_areas (name);

ALTER TABLE cemeteries ADD COLUMN IF NOT EXISTS area_id uuid;
ALTER TABLE cemeteries ADD COLUMN IF NOT EXISTS photo_url text;

ALTER TABLE cemeteries DROP CONSTRAINT IF EXISTS cemeteries_area_id_fkey;
-- Xoá khu không xoá mộ: mộ chỉ rời khỏi khu.
ALTER TABLE cemeteries ADD CONSTRAINT cemeteries_area_id_fkey
  FOREIGN KEY (area_id) REFERENCES grave_areas (id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS cemeteries_area_id_idx ON cemeteries (area_id);

COMMIT;

-- Tiếp theo: pnpm backfill:graves -- --apply --areas scripts/data/grave-areas.json
-- (tạo khu từ description của các mộ và gắn area_id).
--
-- Kiểm chứng:
--   SELECT a.name, a.polygon IS NOT NULL AS has_polygon, count(c.id)
--   FROM grave_areas a LEFT JOIN cemeteries c ON c.area_id = a.id GROUP BY 1, 2 ORDER BY 3 DESC;

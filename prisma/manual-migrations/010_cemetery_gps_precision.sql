-- 010_cemetery_gps_precision.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 001).
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/010_cemetery_gps_precision.sql
--
-- Sau đó: pnpm prisma:generate. PHẢI chạy TRƯỚC khi deploy BE (client mới
-- SELECT gps_precision). Cột additive, BE cũ vẫn chạy được.
--
-- VÌ SAO: phần lớn mộ trong gia phả chỉ biết khu an táng ("Mộ: Đùng Vành"),
-- không biết vị trí từng ngôi. Cả khu dùng chung một toạ độ; nếu chỉ lưu
-- latitude/longitude thì giao diện sẽ coi đó là "đã xác định GPS" và chỉ
-- đường tới sai chỗ. Cột này nói rõ toạ độ là của ngôi mộ hay của cả khu.

BEGIN;

ALTER TABLE cemeteries ADD COLUMN IF NOT EXISTS gps_precision text;

-- Toạ độ đang có đều do người nhập tay tại mộ.
UPDATE cemeteries SET gps_precision = 'EXACT'
WHERE gps_precision IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;

ALTER TABLE cemeteries DROP CONSTRAINT IF EXISTS cemeteries_gps_precision_check;
ALTER TABLE cemeteries ADD CONSTRAINT cemeteries_gps_precision_check CHECK (
      (gps_precision IS NULL OR gps_precision IN ('EXACT', 'AREA'))
  -- Có độ chính xác ⇔ có đủ toạ độ. GravesService giữ bất biến này.
  AND ((gps_precision IS NULL) = (latitude IS NULL OR longitude IS NULL))
);

COMMIT;

-- Kiểm chứng:
--   SELECT gps_precision, count(*) FROM cemeteries GROUP BY 1;

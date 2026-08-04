-- 001_add_member_generation.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này.
-- Repo v2 không sở hữu prisma/migrations; migration lịch sử chạy từ repo v1
-- (`cd ../backend && prisma migrate dev`). File này ghi lại chính xác DDL đã
-- áp thủ công lên Supabase để repo v1 có thể đồng bộ lại sau.
--
-- Cách chạy (PHẢI dùng DIRECT_URL, không phải DATABASE_URL — CREATE INDEX
-- CONCURRENTLY không chạy được trong transaction / qua pgbouncer transaction mode):
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/001_add_member_generation.sql
--
-- Sau đó: pnpm prisma:generate
-- Kiểm chứng schema khớp DB:
--   pnpm exec prisma migrate diff \
--     --from-schema-datasource prisma/schema.prisma \
--     --to-schema-datamodel   prisma/schema.prisma
--
-- CẢNH BÁO PHỐI HỢP VỚI V1: thay đổi này additive + nullable nên Prisma client
-- của v1 vẫn chạy bình thường (Prisma liệt kê cột tường minh, cột lạ là vô hình).
-- Nhưng lần sau ai đó chạy `prisma migrate dev` / `db push` từ repo v1, Prisma sẽ
-- coi members.generation là drift và đề nghị DROP. Phải thêm hai cột + index này
-- vào schema.prisma của v1 ngay khi tiếp cận được repo đó.

-- Thế hệ đã tính sẵn (giá trị hiệu lực: nhập tay ưu tiên, ngược lại suy ra).
ALTER TABLE members ADD COLUMN IF NOT EXISTS generation integer;
ALTER TABLE members ADD COLUMN IF NOT EXISTS generation_updated_at timestamp(3);

-- Phục vụ lọc/sắp xếp theo thế hệ ở GET /v2/members và orderBy khi build full chart.
CREATE INDEX CONCURRENTLY IF NOT EXISTS members_generation_idx ON members (generation);

-- profiles hiện KHÔNG có index nào, mà getMemberStats/computeStats đang scan nó.
CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_generation_idx
  ON profiles (generation) WHERE generation IS NOT NULL;

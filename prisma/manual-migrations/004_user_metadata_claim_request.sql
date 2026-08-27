-- 004_user_metadata_claim_request.sql
--
-- TÀI LIỆU HOÁ — không có runner nào tự động chạy file này (xem 002_*.sql).
-- Repo v2 KHÔNG sở hữu prisma/migrations; file này ghi lại chính xác DDL đã áp
-- thủ công lên Supabase để repo v1 có thể đồng bộ lại sau.
--
-- Cách chạy (PHẢI dùng DIRECT_URL — CREATE INDEX CONCURRENTLY không chạy được
-- trong transaction / qua pgbouncer transaction mode):
--
--   psql "$DIRECT_URL" -f prisma/manual-migrations/004_user_metadata_claim_request.sql
--
-- Sau đó: pnpm prisma:generate
--
-- BỐI CẢNH: đăng ký giờ CHỈ tạo tài khoản `guest` — không tạo Member/Profile
-- nữa. Những gì người dùng tự khai lúc đăng ký phải nằm ở đâu đó cho tới khi
-- admin duyệt và gắn tài khoản vào một Member CÓ SẴN; chỗ đó là `claim_request`.
--
-- AN TOÀN VỚI DỮ LIỆU CŨ: cả ba cột đều nullable hoặc có DEFAULT, nên mọi row
-- user_metadata hiện có vẫn hợp lệ và Prisma client cũ (repo v1) vẫn chạy.
-- Cột `roles` KHÔNG bị đụng tới — tài khoản đang là 'member' vẫn là 'member'.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CỘT MỚI CHO `user_metadata`
-- ─────────────────────────────────────────────────────────────────────────────

-- Hồ sơ tự khai lúc đăng ký. Admin đọc để biết người này khai mình là ai.
ALTER TABLE "user_metadata" ADD COLUMN IF NOT EXISTS "claim_request" JSONB;

-- Thời điểm đăng ký. Row cũ được backfill về now() — chấp nhận được vì cột này
-- chỉ dùng để SẮP XẾP danh sách chờ duyệt, không phải dữ liệu nghiệp vụ.
ALTER TABLE "user_metadata"
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Thời điểm admin gắn tài khoản vào một Member. null = chưa duyệt.
-- CỐ Ý để null cho row cũ: chúng được link bởi luồng register cũ (tự động, không
-- ai duyệt), nên "chưa từng có ai bấm duyệt" là mô tả ĐÚNG sự thật.
ALTER TABLE "user_metadata" ADD COLUMN IF NOT EXISTS "linked_at" TIMESTAMP(3);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INDEX cho danh sách guest chờ duyệt (GET /v2/auth/users)
-- ─────────────────────────────────────────────────────────────────────────────

-- (created_at DESC, id) — id làm tie-breaker để phân trang ổn định khi nhiều
-- tài khoản đăng ký trong cùng một mili giây.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_metadata_created_at_id_idx"
  ON "user_metadata" ("created_at" DESC, "id");

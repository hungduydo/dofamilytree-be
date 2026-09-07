#!/usr/bin/env bash
#
# Dump toàn bộ Postgres của Supabase ra file đã nén + mã hoá.
#
# TẠI SAO CÓ FILE NÀY: Supabase gói free không có auto-backup lẫn PITR. Ngày
# 31/08/2026 một lần `prisma migrate dev` đã reset schema `public` và không có
# gì để khôi phục (xem docs/BACKUP_RESTORE.md).
#
# Cách chạy:
#   pnpm db:backup                  # ghi vào backup/<timestamp>/
#   BACKUP_DIR=/tmp/x pnpm db:backup
#
# Cần: pg_dump (>= version server), gzip, gpg, và biến DIRECT_URL.
# BACKUP_GPG_PASSPHRASE bỏ trống ⇒ bỏ qua bước mã hoá (chỉ nên dùng khi test).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Local thì đọc .env; trên CI biến đã có sẵn trong môi trường nên đừng ghi đè.
if [[ -z "${DIRECT_URL:-}" && -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "✖ Thiếu DIRECT_URL." >&2
  exit 1
fi

# pg_dump KHÔNG chạy được qua PgBouncer (transaction pooling). DATABASE_URL trỏ
# cổng 6543 — nhầm cái này là dump lỗi giữa chừng hoặc ra dữ liệu thiếu.
if [[ "$DIRECT_URL" == *"6543"* || "$DIRECT_URL" == *"pgbouncer=true"* ]]; then
  echo "✖ DIRECT_URL đang trỏ vào pooler (6543/pgbouncer). pg_dump cần session mode, cổng 5432." >&2
  exit 1
fi

TIMESTAMP="${BACKUP_TIMESTAMP:-$(date -u +%Y-%m-%dT%H-%M-%SZ)}"
OUT="${BACKUP_DIR:-$ROOT/backup}/$TIMESTAMP"
mkdir -p "$OUT"

echo "▸ Dump vào $OUT"
echo "  pg_dump: $(pg_dump --version)"

# 1. Bản chính: custom format ⇒ pg_restore chọn lọc được từng bảng khi chỉ cần
#    cứu một phần. CÓ DDL — repo không có prisma/migrations nên bản dump này
#    chính là source of truth của schema (kể cả index GIN/trigram).
pg_dump "$DIRECT_URL" \
  --schema=public --format=custom --no-owner --no-privileges \
  --file="$OUT/public.dump"

# 2. Bản plain SQL: để grep/diff/đọc bằng mắt khi cần soi một bảng cụ thể.
pg_dump "$DIRECT_URL" \
  --schema=public --format=plain --no-owner --no-privileges \
  --file="$OUT/public.sql"

# 3. Tài khoản đăng nhập. auth.users KHÔNG nằm trong schema.prisma — dump mỗi
#    `public` là mất sạch tài khoản. Đây cũng là bản DUY NHẤT giữ được
#    encrypted_password (API admin của Supabase không trả hash về).
#    Không fail cả job nếu Supabase chặn role postgres đọc schema auth —
#    auth-export.ts là lớp dự phòng.
if pg_dump "$DIRECT_URL" \
  --data-only --format=plain --no-owner --no-privileges \
  --table='auth.users' --table='auth.identities' \
  --file="$OUT/auth.sql" 2>"$OUT/auth.err"; then
  rm -f "$OUT/auth.err"
else
  echo "⚠ Không dump được schema auth (xem auth.err). Sẽ chỉ còn auth-users.json — restore từ đó buộc user reset mật khẩu." >&2
  rm -f "$OUT/auth.sql"
fi

# Niêm phong (nén + mã hoá). CI đặt BACKUP_DEFER_ENCRYPT=1 vì job verify cần bản
# thô, và vì auth-export/storage-manifest còn ghi thêm file sau bước này —
# workflow gọi seal.sh một lần ở cuối. Local cũng nên làm vậy khi chạy đủ 3 script.
if [[ "${BACKUP_DEFER_ENCRYPT:-}" != "1" && -n "${BACKUP_GPG_PASSPHRASE:-}" ]]; then
  bash "$ROOT/scripts/backup/seal.sh" "$OUT"
fi

echo "▸ Kết quả:"
sha() { command -v sha256sum >/dev/null && sha256sum "$1" || shasum -a 256 "$1"; }
( cd "$OUT" && for f in *; do
    printf '  %-40s %8s  %s\n' "$f" "$(du -h "$f" | cut -f1)" "$(sha "$f" | cut -c1-16)"
  done )

# Cho workflow/step sau biết thư mục vừa tạo.
echo "$OUT" > "${BACKUP_DIR:-$ROOT/backup}/.last"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "dir=$OUT" >> "$GITHUB_OUTPUT"; fi
echo "✔ Xong."

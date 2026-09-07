#!/usr/bin/env bash
#
# Chứng minh bản backup DÙNG ĐƯỢC: giải mã → pg_restore vào một Postgres rỗng →
# đếm số bảng và số dòng. Backup không restore được thì không phải backup.
#
# Cách chạy:
#   # local (cần Docker):
#   docker run -d --rm -p 5433:5432 -e POSTGRES_PASSWORD=verify --name pg-verify postgres:17-alpine
#   VERIFY_URL=postgresql://postgres:verify@localhost:5433/postgres pnpm backup:verify
#   docker rm -f pg-verify
#
#   # CI: workflow dựng service postgres rồi gọi script này.
#
# Biến: VERIFY_URL (bắt buộc), BACKUP_DIR/BACKUP_TIMESTAMP hoặc đối số 1 là thư mục.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Số bảng mong đợi trong schema public (23 model trong prisma/schema.prisma).
# Đổi schema ⇒ nhớ sửa số này, nếu không verify sẽ báo đỏ.
EXPECTED_TABLES="${EXPECTED_TABLES:-23}"

# Các bảng KHÔNG được phép rỗng. Rỗng = dump hỏng hoặc production đã mất dữ liệu.
# Lưu ý: bảng `relationships` là di sản của backend v1 và ĐANG RỖNG — quan hệ
# thật nằm ở `member_relationships`. Đừng thêm `relationships` vào đây.
CRITICAL_TABLES=(members member_relationships profiles user_metadata)

# Ngưỡng cảnh báo sụt số dòng so với lần chạy trước (%).
DROP_THRESHOLD="${DROP_THRESHOLD:-20}"

if [[ -z "${VERIFY_URL:-}" ]]; then
  echo "✖ Thiếu VERIFY_URL (Postgres rỗng để restore thử)." >&2
  exit 1
fi

DIR="${1:-}"
if [[ -z "$DIR" ]]; then
  BASE="${BACKUP_DIR:-$ROOT/backup}"
  if [[ -n "${BACKUP_TIMESTAMP:-}" ]]; then
    DIR="$BASE/$BACKUP_TIMESTAMP"
  elif [[ -f "$BASE/.last" ]]; then
    DIR="$(cat "$BASE/.last")"
  fi
fi
if [[ -z "$DIR" || ! -d "$DIR" ]]; then
  echo "✖ Không tìm thấy thư mục backup để kiểm tra." >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "▸ Kiểm tra $DIR"

# Giải mã + giải nén bản custom-format.
if [[ -f "$DIR/public.dump.gz.gpg" ]]; then
  if [[ -z "${BACKUP_GPG_PASSPHRASE:-}" ]]; then
    echo "✖ Backup đã mã hoá nhưng thiếu BACKUP_GPG_PASSPHRASE." >&2
    exit 1
  fi
  gpg --batch --yes --quiet --decrypt --passphrase "$BACKUP_GPG_PASSPHRASE" \
    --output "$WORK/public.dump.gz" "$DIR/public.dump.gz.gpg"
elif [[ -f "$DIR/public.dump.gz" ]]; then
  cp "$DIR/public.dump.gz" "$WORK/"
elif [[ -f "$DIR/public.dump" ]]; then
  cp "$DIR/public.dump" "$WORK/"
  gzip -f "$WORK/public.dump"
else
  echo "✖ Không thấy public.dump.gz[.gpg] trong $DIR." >&2
  exit 1
fi
gunzip -f "$WORK/public.dump.gz"

# 1. Mục lục đọc được?
pg_restore --list "$WORK/public.dump" > "$WORK/toc.txt"
echo "  mục lục: $(wc -l < "$WORK/toc.txt") mục"

# 2. Restore thật. --exit-on-error để một lỗi bất kỳ là fail luôn, không im lặng.
#    Bản dump thường tự chứa `CREATE SCHEMA public` — tạo sẵn thì restore chết vì
#    "schema already exists". Chỉ tạo tay khi dump KHÔNG có mục SCHEMA.
psql "$VERIFY_URL" -q -c 'DROP SCHEMA IF EXISTS public CASCADE;'
if ! grep -q 'SCHEMA - public' "$WORK/toc.txt"; then
  psql "$VERIFY_URL" -q -c 'CREATE SCHEMA public;'
fi

# Supabase cài pg_trgm vào schema `extensions`, và bản dump tham chiếu
# `extensions.gin_trgm_ops` trong các index tìm kiếm. Postgres trắng không có
# schema đó ⇒ restore chết. Khôi phục vào một Supabase project mới cũng phải
# chạy đúng hai lệnh này trước (xem docs/BACKUP_RESTORE.md).
psql "$VERIFY_URL" -q -c 'CREATE SCHEMA IF NOT EXISTS extensions;'
psql "$VERIFY_URL" -q -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;'
pg_restore --no-owner --no-privileges --exit-on-error --dbname "$VERIFY_URL" "$WORK/public.dump"

# 3. Đủ bảng?
TABLES=$(psql "$VERIFY_URL" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
echo "  bảng: $TABLES (mong đợi $EXPECTED_TABLES)"
if [[ "$TABLES" -lt "$EXPECTED_TABLES" ]]; then
  echo "✖ Thiếu bảng sau khi restore." >&2
  exit 1
fi

# 4. Index GIN/trigram — schema dùng chúng cho tìm kiếm; mất là app chạy chậm thảm hại.
GIN=$(psql "$VERIFY_URL" -tAc \
  "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexdef ILIKE '%USING gin%'")
echo "  index GIN: $GIN"
if [[ "$GIN" -lt 1 ]]; then
  echo "✖ Không có index GIN nào — bản dump có thể thiếu DDL." >&2
  exit 1
fi

# 5. Số dòng các bảng trọng yếu + so với lần chạy trước.
PREV="${PREV_COUNTS:-}"
: > "$WORK/counts.json"
echo '{' >> "$WORK/counts.json"
FAILED=0
for i in "${!CRITICAL_TABLES[@]}"; do
  t="${CRITICAL_TABLES[$i]}"
  n=$(psql "$VERIFY_URL" -tAc "SELECT count(*) FROM public.\"$t\"")
  sep=','
  if [[ "$i" -eq $((${#CRITICAL_TABLES[@]} - 1)) ]]; then sep=''; fi
  echo "  \"$t\": $n$sep" >> "$WORK/counts.json"

  if [[ "$n" -eq 0 ]]; then
    echo "✖ Bảng $t RỖNG." >&2
    FAILED=1
    continue
  fi

  if [[ -n "$PREV" && -f "$PREV" ]]; then
    old=$(python3 -c "import json,sys; print(json.load(open('$PREV')).get('$t', 0))")
    if [[ "$old" -gt 0 ]]; then
      floor=$(( old * (100 - DROP_THRESHOLD) / 100 ))
      if [[ "$n" -lt "$floor" ]]; then
        echo "✖ $t sụt từ $old → $n (quá $DROP_THRESHOLD%)." >&2
        FAILED=1
        continue
      fi
    fi
    echo "  $t: $n (lần trước $old)"
  else
    echo "  $t: $n"
  fi
done
echo '}' >> "$WORK/counts.json"

cp "$WORK/counts.json" "$DIR/counts.json"

if [[ "$FAILED" -ne 0 ]]; then
  echo "✖ Verify THẤT BẠI — KHÔNG được coi bản backup này là dùng được." >&2
  exit 1
fi

echo "✔ Bản backup restore được và dữ liệu hợp lý."

#!/usr/bin/env bash
#
# Nén + mã hoá mọi file trong một thư mục backup.
#
# Tách khỏi db-backup.sh vì auth-export.ts và storage-manifest.ts ghi file SAU
# khi dump xong — auth-users.json chứa email và metadata của người dùng, tuyệt
# đối không được để plaintext (và không được đẩy lên R2 dạng thô).
#
#   pnpm backup:seal            # niêm phong thư mục backup mới nhất
#   pnpm backup:seal <thư mục>

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ -z "${BACKUP_GPG_PASSPHRASE:-}" && -f "$ROOT/.env" ]]; then
  set -a; # shellcheck disable=SC1091
  source "$ROOT/.env"; set +a
fi

DIR="${1:-}"
if [[ -z "$DIR" ]]; then
  BASE="${BACKUP_DIR:-$ROOT/backup}"
  if [[ -n "${BACKUP_TIMESTAMP:-}" ]]; then DIR="$BASE/$BACKUP_TIMESTAMP"
  elif [[ -f "$BASE/.last" ]]; then DIR="$(cat "$BASE/.last")"; fi
fi
if [[ -z "$DIR" || ! -d "$DIR" ]]; then
  echo "✖ Không tìm thấy thư mục backup." >&2
  exit 1
fi

if [[ -z "${BACKUP_GPG_PASSPHRASE:-}" ]]; then
  echo "✖ Thiếu BACKUP_GPG_PASSPHRASE — từ chối để lại backup dạng plaintext." >&2
  exit 1
fi

for f in "$DIR"/*; do
  [[ -f "$f" ]] || continue
  case "$f" in
    *.gpg) continue ;;             # đã niêm phong
    *counts.json) continue ;;      # chỉ là số đếm, cần đọc được để so lần sau
  esac
  gzip -9 -f "$f"
  gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase "$BACKUP_GPG_PASSPHRASE" "$f.gz"
  rm -f "$f.gz"
done

echo "✔ Đã niêm phong $DIR"

# Backup & khôi phục dữ liệu

> ## ⛔ ĐỌC TRƯỚC KHI ĐỘNG VÀO DATABASE
>
> **KHÔNG BAO GIỜ** chạy `prisma migrate dev`, `prisma migrate reset` hay
> `prisma db push --force-reset` khi `DIRECT_URL` trỏ production.
>
> Ngày **31/08/2026** đúng lệnh này đã reset schema `public` và xoá sạch dữ liệu
> production. Supabase gói free **không có auto-backup, không có PITR** — không
> có gì để khôi phục. Dấu vết còn lại: `scripts/restore-from-import-json.ts`,
> `scripts/restore-user-metadata.ts` (5/8 hàng `user_metadata` phải đoán lại).
>
> Quy trình đổi schema đúng:
> 1. Chạy tay workflow **Database backup** (`workflow_dispatch`) và đợi nó xanh.
> 2. Viết file SQL mới trong `prisma/manual-migrations/`.
> 3. `psql "$DIRECT_URL" -f prisma/manual-migrations/00X_ten_file.sql`
> 4. `prisma db pull` để đồng bộ lại `schema.prisma`, rồi `prisma generate`.

---

## 1. Hệ thống backup hiện tại

| | Cái gì | Chạy khi nào | Lưu ở đâu |
|---|---|---|---|
| **Postgres `public`** | DDL + toàn bộ dữ liệu (`public.dump` custom format + `public.sql` plain) | Hằng ngày 00:00 VN + chạy tay | R2 `db/{daily,weekly,monthly}/<timestamp>/` |
| **Supabase Auth** | `auth.users` + `auth.identities` (`auth.sql`, **có password hash**) và `auth-users.json` (API, **không có hash**) | Cùng lúc | ↑ |
| **Kho ảnh — bản kê** | `storage-manifest.json`: key, size, etag của mọi object | Cùng lúc | ↑ |
| **Kho ảnh — bản sao** | `rclone copy` sang bucket backup | Hằng tuần, Chủ nhật 01:30 VN | R2 `storage/` ở bucket backup |
| **Redis (Upstash)** | *không backup* — chỉ là cache, mất thì tự dựng lại | — | — |

- **RPO ≈ 24h.** Mất tối đa một ngày dữ liệu. Cần chặt hơn thì tăng tần suất cron
  trong `.github/workflows/db-backup.yml`, hoặc nâng Supabase lên gói có PITR.
- Mọi file đều **gzip + GPG AES256** trước khi lên R2 (dump chứa PII và password hash).
- Workflow **tự restore thử mỗi ngày** vào một Postgres rỗng và kiểm tra số bảng,
  index GIN, số dòng các bảng trọng yếu. Verify đỏ ⇒ GitHub gửi email.

### Ba kho dữ liệu độc lập — phải khôi phục cả ba

1. **Postgres `public`** — 23 bảng theo `prisma/schema.prisma`.
2. **Supabase Auth (`auth.users`)** — *không* nằm trong `schema.prisma`. Mất là
   không ai đăng nhập được, kể cả khi `public` còn nguyên.
3. **Kho ảnh (R2/Vercel Blob)** — `Media.file_path` và `Member.avatar_url` trỏ theo
   **UUID của member**. Khôi phục DB với UUID mới ⇒ toàn bộ ảnh mất liên kết.
   **DB và ảnh phải khôi phục thành cặp khớp nhau.**

---

## 2. Chạy backup thủ công

```bash
pnpm db:backup                 # dump public + auth → backup/<timestamp>/
pnpm backup:auth-export        # thêm auth-users.json (+ đối soát user_metadata)
pnpm backup:storage-manifest   # thêm storage-manifest.json
pnpm backup:seal               # gzip + GPG toàn bộ thư mục
pnpm backup:upload             # đẩy lên R2 (tier tự chọn theo ngày)
```

`backup:seal` phải chạy SAU cả ba script trên — `auth-users.json` chứa email và
metadata người dùng, `backup:upload` sẽ từ chối nếu còn file chưa mã hoá.

Cần `pg_dump` phiên bản ≥ Postgres của Supabase (macOS: `brew install libpq`).
Không cần AWS CLI — script dùng `@aws-sdk/client-s3` đã có sẵn trong repo.

Kiểm tra bản vừa tạo có restore được không (cần Docker):

```bash
docker run -d --rm -p 5433:5432 -e POSTGRES_PASSWORD=verify --name pg-verify postgres:17-alpine
VERIFY_URL=postgresql://postgres:verify@localhost:5433/postgres pnpm backup:verify
docker rm -f pg-verify
```

---

## 3. Khôi phục — runbook

### 3.0 Lấy bản backup về

Xem danh sách các mốc backup trên Cloudflare dashboard (R2 → `dofamilytree-backup`
→ `db/daily/`), rồi tải về:

```bash
TS=2026-09-06T10-56-49Z
for f in public.dump auth.sql auth-users.json storage-manifest.json public.sql; do
  pnpm backup:upload --get "db/daily/$TS/$f.gz.gpg" "$f.gz.gpg"
done

for f in *.gpg; do gpg --batch --decrypt --passphrase "$BACKUP_GPG_PASSPHRASE" \
  --output "${f%.gpg}" "$f"; done
gunzip *.gz
```

### 3.1 Khôi phục Postgres `public`

Bản dump **chính là source of truth của schema** — repo không có
`prisma/migrations/` để replay.

```bash
# Chỉ chạy khi schema đang hỏng/rỗng. Lệnh này XOÁ schema public hiện tại.
# KHÔNG tạo lại schema — bản dump đã chứa sẵn `CREATE SCHEMA public`,
# tạo tay trước sẽ làm pg_restore chết vì "schema already exists".
psql "$DIRECT_URL" -c 'DROP SCHEMA IF EXISTS public CASCADE;'

# Bắt buộc khi khôi phục sang project/DB MỚI: các index tìm kiếm tham chiếu
# `extensions.gin_trgm_ops` (Supabase cài pg_trgm vào schema `extensions`).
# Thiếu là pg_restore chết giữa chừng.
psql "$DIRECT_URL" -c 'CREATE SCHEMA IF NOT EXISTS extensions;
                       CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;'

pg_restore --no-owner --no-privileges --exit-on-error --dbname "$DIRECT_URL" public.dump
```

Chỉ cứu **một bảng**:

```bash
pg_restore --data-only --no-owner --table=members --dbname "$DIRECT_URL" public.dump
```

### 3.2 Khôi phục tài khoản (Supabase Auth)

**Ưu tiên `auth.sql`** — chỉ bản này giữ được mật khẩu:

```bash
psql "$DIRECT_URL" -f auth.sql
```

Nếu không có `auth.sql` (Supabase chặn dump schema `auth`), dựng lại từ
`auth-users.json` bằng `supabase.auth.admin.createUser` — **mọi người sẽ phải
reset mật khẩu**, hãy báo trước.

### 3.3 ⚠️ Bước bắt buộc: đối soát `user_metadata`

Thiếu một dòng `user_metadata` là tài khoản đó **không đăng nhập được**
(`AuthService.login` ném 401 `User profile data missing`). Chỉ luồng `register`
mới tạo dòng này, nên restore lệch pha là hỏng login hàng loạt — đúng những gì
đã xảy ra sau sự cố 31/08.

```sql
-- Phải trả về 0 dòng.
SELECT u.id, u.email FROM auth.users u
LEFT JOIN public.user_metadata m ON m.user_id = u.id
WHERE m.user_id IS NULL;
```

Có dòng thừa ra ⇒ dùng `scripts/restore-user-metadata.ts` (mặc định chạy thử,
`--apply` mới ghi).

### 3.4 Khôi phục ảnh

```bash
# Object nào có trong manifest mà bucket hiện tại không còn?
python3 - <<'PY'
import json, subprocess
have = {l.split()[-1] for l in subprocess.run(
    ["aws","s3api","list-objects-v2","--bucket",BUCKET,"--query","Contents[].Key",
     "--output","text","--endpoint-url",ENDPOINT], capture_output=True, text=True
).stdout.split()}
want = {o["key"] for o in json.load(open("storage-manifest.json"))["r2"]["objects"]}
print("\n".join(sorted(want - have)))
PY

# Copy lại từ bucket backup (giữ NGUYÊN key — file_path phụ thuộc UUID member).
aws s3 cp "s3://$R2_BACKUP_BUCKET/storage/<key>" "s3://$R2_BUCKET_NAME/<key>" $R2
```

### 3.5 Smoke test trước khi tuyên bố xong

1. Đăng nhập bằng một tài khoản thật.
2. Mở cây gia phả — thấy đủ thành viên.
3. Mở thư viện ảnh — ảnh hiển thị (không 404).
4. So `SELECT count(*)` các bảng `members`, `member_relationships`, `profiles`,
   `user_metadata` với `counts.json` đi kèm bản backup.
   (`relationships` là bảng di sản của v1 và vốn đã rỗng — đừng hoảng.)

---

## 4. Thiết lập lần đầu (làm trên dashboard)

### Cloudflare R2

1. Tạo bucket **`dofamilytree-backup`**, tách khỏi bucket ảnh. **Không** bật public access.
2. Tạo API token riêng cho bucket này (Object Read & Write) → `R2_BACKUP_ACCESS_KEY_ID` / `R2_BACKUP_SECRET_ACCESS_KEY`.
3. Đặt **lifecycle rule theo prefix** (tự xoá, không script nào cần quyền delete):

   | Prefix | Xoá sau |
   |---|---|
   | `db/daily/` | 14 ngày |
   | `db/weekly/` | 60 ngày |
   | `db/monthly/` | 365 ngày |
   | `storage/` | *không xoá* |

### GitHub Secrets (Settings → Secrets and variables → Actions)

`DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`BACKUP_GPG_PASSPHRASE`, `STORAGE_PROVIDER`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BLOB_READ_WRITE_TOKEN` (nếu còn dùng),
`R2_BACKUP_BUCKET`, `R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY`.

> **`BACKUP_GPG_PASSPHRASE` mất là mất toàn bộ backup.** Lưu ở password manager,
> đừng chỉ để trong GitHub Secrets (Secrets không đọc lại được sau khi lưu).

Sinh passphrase: `openssl rand -base64 32`

---

## 5. Diễn tập khôi phục — hằng quý

Backup chưa từng restore thử là backup chưa chắc dùng được. Mỗi quý:

1. Chạy tay workflow **Database backup**, xem job `verify` xanh.
2. Làm đầy đủ mục 3 vào một Supabase project tạm, trỏ app local vào đó, đăng nhập được.
3. Ghi lại vào bảng dưới.

| Ngày diễn tập | Người làm | Kết quả | Ghi chú |
|---|---|---|---|
| *(chưa có)* | | | |

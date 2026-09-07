# Family Tree API v2

NestJS REST API — phiên bản mới song song với Express backend v1.

| | Backend v1 | Backend v2 |
|---|---|---|
| Framework | Express.js | **NestJS 10** |
| Port | (default) | **3002** |
| Relationship table | `relationships` | **`member_relationships`** |
| Relationship types | PARENT / CHILD / SPOUSE | **BIOLOGICAL / ADOPTED / SPOUSE** |
| Cache | Vercel Blob | **Upstash Redis (REST)** |
| Queue | — | **Upstash QStash (HTTP callback)** |
| Image processing | — | **sharp (compress + resize)** |
| Docs | Swagger | **Swagger `/docs`** |

---

> ## ⛔ KHÔNG chạy `prisma migrate dev` / `migrate reset` với DB production
>
> Ngày 31/08/2026 một lệnh `prisma migrate dev` đã reset schema `public` và xoá
> sạch dữ liệu production. Supabase gói free không có auto-backup lẫn PITR.
> Đổi schema thì dùng file SQL tay (mục [Migration thủ công](#migration-thủ-công)),
> và **chạy backup trước** — xem [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md).

---

## Cài đặt

Yêu cầu **Node >= 22** (pnpm 11 pin trong `packageManager` cần Node 22.13+) và **pnpm**.

```bash
# 1. Cài dependencies
pnpm install

# 2. Copy env
cp .env.example .env
# Bắt buộc: DATABASE_URL, DIRECT_URL, SUPABASE_URL, SUPABASE_SECRET_KEY, JWT_SECRET

# 3. Generate Prisma client
pnpm prisma:generate

# 4. Áp schema — xem "Migration thủ công" bên dưới.
#    ⛔ KHÔNG dùng `prisma migrate dev` với DB production.

# 5. (Optional) Migrate dữ liệu cũ sang bảng mới
pnpm migrate:relationships
```

### Migration thủ công

Một số thay đổi schema được áp thẳng lên Supabase thay vì qua `prisma migrate` (repo v2 không sở hữu
`prisma/migrations`). DDL được lưu lại trong `prisma/manual-migrations/` để tài liệu hoá — **không có
runner nào tự chạy chúng**. Chạy bằng `DIRECT_URL`, không phải `DATABASE_URL`:

```bash
psql "$DIRECT_URL" -f prisma/manual-migrations/001_add_member_generation.sql
```

**Trước mỗi lần áp DDL**, chạy tay workflow *Database backup* trên GitHub Actions
(hoặc `pnpm db:backup` ở local) và đợi nó xong. Sau khi áp xong, `prisma db pull`
để đồng bộ lại `schema.prisma`.

Sau khi chạy, backfill dữ liệu thế hệ:

```bash
pnpm backfill:generations -- --dry-run   # xem phân bố trước
pnpm backfill:generations
```

---

## Chạy server

```bash
pnpm dev        # Development (watch mode) → http://localhost:3002
pnpm build      # Build production
pnpm start      # Start production build
```

Swagger UI: **http://localhost:3002/docs**

---

## Cấu trúc thư mục

```
family-be-v2/
├── src/
│   ├── auth/                 # Đăng ký/đăng nhập, JWT guard, phân quyền, quên mật khẩu
│   ├── members/              # Member + Profile CRUD
│   ├── relationships/        # MemberRelationship CRUD + search
│   ├── tree/                 # Cây gia phả (Redis cache + BFS subtree)
│   ├── generation/           # Tính/backfill đời
│   ├── events/               # Anniversaries + Events
│   ├── life-events/          # Mốc đời của từng member
│   ├── memories/             # Kỷ niệm
│   ├── memorial/             # Thắp hương, lời tưởng niệm
│   ├── articles/             # Bài viết
│   ├── graves/               # Cemetery + GPS nearby search
│   ├── contact/              # Form liên hệ (public, chặn bằng rate limit)
│   ├── media/                # Upload ảnh: multipart hoặc presigned PUT
│   ├── storage/              # Facade R2 / Vercel Blob (STORAGE_PROVIDER)
│   ├── supabase/             # Client service-role + resolver secret key
│   ├── queue/                # QStash: service, signature guard, callback controller
│   ├── prisma/               # PrismaService (global singleton)
│   ├── redis.provider.ts     # Upstash Redis REST client
│   ├── swagger.config.ts     # Nguồn spec duy nhất cho /docs và swagger:export
│   ├── main.ts               # Port 3002, prefix /v2
│   └── vercel.ts             # Entry cho Vercel (Express adapter)
├── prisma/
│   ├── schema.prisma
│   └── manual-migrations/    # DDL áp tay — KHÔNG có runner tự chạy
├── scripts/
│   ├── backup/               # db-backup, auth-export, storage-manifest, seal, upload, verify
│   └── *.ts                  # backfill, bootstrap-admin, audit-roles, restore…
├── .github/workflows/        # db-backup (hằng ngày + verify), storage-sync (hằng tuần)
├── test/                     # Jest + @nestjs/testing
└── docs/                     # BACKUP_RESTORE, USERS_AND_ROLES, swagger.{json,yaml}
```

---

## Phân quyền

Bốn role: `guest < member < editor < admin`. Người tự đăng ký là **guest**; admin
nâng lên **member** bằng cách gắn tài khoản vào một Member có sẵn, hoặc thành
**editor** (nhân sự thuê ngoài: sửa được dữ liệu, không xem thông tin liên lạc,
không xoá).

📖 **[docs/USERS_AND_ROLES.md](docs/USERS_AND_ROLES.md)** — bảng phân quyền đầy đủ
theo route, luồng duyệt tài khoản, breaking change cho FE, và quy tắc cho người
sửa BE. Đọc file đó trước khi thêm route mới hoặc đụng tới `profile`.

## API Endpoints

Hầu hết endpoints yêu cầu `Authorization: Bearer <JWT>`; một số route đọc là công
khai và một số route ghi yêu cầu role tối thiểu — xem bảng trong
[docs/USERS_AND_ROLES.md](docs/USERS_AND_ROLES.md#5-bảng-phân-quyền-theo-route).

### Members `/v2/members`

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/v2/members` | Danh sách thành viên (page, pageSize) |
| `GET` | `/v2/members/search?name=` | Tìm kiếm không dấu tiếng Việt |
| `GET` | `/v2/members/:id` | Chi tiết member |
| `POST` | `/v2/members` | Tạo member + profile |
| `GET` | `/v2/members/:id/profile` | Profile đầy đủ + relationships |
| `PUT` | `/v2/members/:id/profile` | Cập nhật (multipart, hỗ trợ avatar) |
| `DELETE` | `/v2/members/:id` | Xóa (cascade profile + userMetadata) |

### Relationships

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/v2/members/:id/relationships` | Tất cả quan hệ của member |
| `GET` | `/v2/members/:id/relationships/parents` | Cha/mẹ |
| `GET` | `/v2/members/:id/relationships/children` | Con |
| `GET` | `/v2/members/:id/relationships/spouses` | Vợ/chồng |
| `GET` | `/v2/members/:id/relationships/ancestors` | Toàn bộ tổ tiên (recursive CTE) |
| `GET` | `/v2/members/:id/relationships/descendants` | Toàn bộ con cháu (recursive CTE) |
| `GET` | `/v2/relationships/search` | Tìm: `?type=BIOLOGICAL&memberId=...&role=parent` |
| `POST` | `/v2/members/:id/relationships` | Thêm quan hệ |
| `DELETE` | `/v2/relationships/:id` | Xóa quan hệ |

**Relationship types mới:**
- `BIOLOGICAL` — cha/mẹ ruột
- `ADOPTED` — cha/mẹ nuôi (mỗi member tối đa 1 BIOLOGICAL hoặc ADOPTED parent)
- `SPOUSE` — vợ/chồng (bidirectional, không giới hạn)

### Tree `/v2/tree`

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/v2/tree/chart` | Toàn bộ cây gia phả (**Redis cache 1h**) |
| `GET` | `/v2/tree/chart/:memberId` | Subtree 4 thế hệ từ member |
| `POST` | `/v2/tree/regenerate` | Force rebuild + xóa Redis cache |
| `GET` | `/v2/tree/stats` | Thống kê + cache status |
| `GET` | `/v2/tree/home` | Trees có `show=true` |
| `GET` | `/v2/tree` | Tất cả Tree records |
| `GET` | `/v2/tree/:id` | Chi tiết Tree |
| `POST` | `/v2/tree` | Tạo nhánh cây mới |
| `PUT` | `/v2/tree/:id` | Cập nhật nhánh |
| `DELETE` | `/v2/tree/:id` | Xóa nhánh |

### Anniversaries (Ngày giỗ) `/v2/anniversaries`

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/v2/anniversaries` | Danh sách (filter: member_id, month) |
| `GET` | `/v2/anniversaries/upcoming` | Sắp tới (30 ngày) |
| `GET` | `/v2/anniversaries/:id` | Chi tiết |
| `POST` | `/v2/anniversaries` | Tạo mới (member_id optional) |
| `PUT` | `/v2/anniversaries/:id` | Cập nhật |
| `DELETE` | `/v2/anniversaries/:id` | Xóa |

### Events (Sự kiện) `/v2/events`

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/v2/events` | Danh sách (filter: highlight, fromDate, toDate) |
| `GET` | `/v2/events/:id` | Chi tiết |
| `POST` | `/v2/events` | Tạo + emit notification queue |
| `PUT` | `/v2/events/:id` | Cập nhật |
| `DELETE` | `/v2/events/:id` | Xóa |

### Media `/v2/media`

| Method | Path | Mô tả |
|--------|------|--------|
| `POST` | `/v2/media/upload` | Upload ảnh → queue image-process (sharp + Vercel Blob) |
| `GET` | `/v2/media` | Danh sách (filter: uploader_id) |
| `DELETE` | `/v2/media/:id` | Xóa record + Vercel Blob file |

### Graves (Mộ phần) `/v2/graves`

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/v2/graves` | Danh sách (filter: name) |
| `GET` | `/v2/graves/nearby?lat=&lng=&radiusKm=` | Mộ gần tọa độ (Haversine) |
| `GET` | `/v2/graves/:id` | Chi tiết |
| `POST` | `/v2/graves` | Tạo mới |
| `PUT` | `/v2/graves/:id` | Cập nhật |
| `DELETE` | `/v2/graves/:id` | Xóa |

---

## Tác vụ nền (Upstash QStash)

Không dùng BullMQ/worker thường trú — app chạy serverless trên Vercel. Tác vụ
được **QStash gọi ngược lại** qua `POST /v2/queue/callback/:task`, danh tính xác
minh bằng chữ ký ([`qstash-signature.guard.ts`](src/queue/qstash-signature.guard.ts))
chứ không phải token người dùng.

| Task | Trigger | Xử lý |
|------|---------|--------|
| `avatar-upload` | Create/Update member có file avatar | Upload buffer → storage → cập nhật `avatar_url` |
| `image-process` | Upload ảnh | sharp resize (thumb + full) → storage |
| `media-process` | Hoàn tất presigned upload | Nén lossless, sinh metadata, xoá cache thống kê |
| `report-generate` | Create/Delete member | Tính stats (total, generations, deceased) → Redis |
| `generation-recompute` | Đổi quan hệ cha/con | Tính lại đời cho toàn cây |
| `notification` | Member/quan hệ/sự kiện mới | Log (Phase 1); mở rộng email/push sau |

Tên task khai ở [`queue.constants.ts`](src/queue/queue.constants.ts), xử lý ở
[`tasks.service.ts`](src/queue/tasks.service.ts).

---

## Prisma Schema thay đổi

Thêm vào `backend/prisma/schema.prisma` (không ảnh hưởng bảng cũ):

```prisma
enum RelationshipNatureType {
  BIOLOGICAL
  ADOPTED
  SPOUSE
}

model MemberRelationship {
  id         String                 @id @default(uuid()) @db.Uuid
  parent_id  String                 @db.Uuid
  child_id   String                 @db.Uuid
  type       RelationshipNatureType
  note       String?
  created_at DateTime               @default(now())

  parent Member @relation("RelParent", fields: [parent_id], references: [id])
  child  Member @relation("RelChild", fields: [child_id], references: [id])

  @@map("member_relationships")
}
```

Áp schema bằng SQL tay (⛔ **không** `prisma migrate dev` với DB production —
xem [Migration thủ công](#migration-thủ-công) và
[docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md)):
```bash
pnpm db:backup                                       # backup trước đã
psql "$DIRECT_URL" -f prisma/manual-migrations/00X_*.sql
pnpm exec prisma db pull && pnpm prisma:generate
```

---

## Backup & khôi phục

Supabase gói free **không có auto-backup lẫn PITR**. Hệ thống backup tự dựng chạy
trên GitHub Actions **00:00 giờ VN hằng ngày**, và mỗi lần chạy đều tự restore bản
vừa tạo vào một Postgres rỗng rồi kiểm số bảng, index GIN và số dòng — backup
không restore được thì không phải backup, nên workflow báo đỏ thay vì im lặng.

Phạm vi: Postgres `public` (DDL + data), Supabase Auth (`auth.users` kèm password
hash), và bản kê kho ảnh. Mọi file **gzip + GPG AES256** trước khi lên R2.

```bash
pnpm db:backup                 # dump public + auth → backup/<timestamp>/
pnpm backup:auth-export        # tài khoản Supabase Auth ra JSON + đối soát user_metadata
pnpm backup:storage-manifest   # kê toàn bộ object trong kho ảnh
pnpm backup:seal               # gzip + GPG (chạy SAU 3 lệnh trên)
pnpm backup:upload             # đẩy lên bucket backup trên R2
pnpm backup:verify             # restore thử vào Postgres rỗng (cần VERIFY_URL)
```

Runbook đầy đủ (thứ tự khôi phục, thiết lập R2/GitHub Secrets, diễn tập hằng quý):
**[docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md)**

---

## Tests

```bash
pnpm test           # All tests
pnpm test:watch     # Watch mode
pnpm test:cov       # Coverage report
```

Hiện có **647 test / 32 suite**, phủ các vùng: `auth` (đăng ký, đăng nhập, đổi &
đặt lại mật khẩu, phân quyền theo route), `members`, `relationships`, `tree`,
`generation`, `events`, `media`, `graves`, `memorial`, `contact`, `queue`,
`supabase`.

`test/jest.setup.ts` cấp sẵn env giả (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`) nên
test **không đọc `.env` của máy dev** — chạy được trên máy trắng và trên CI.

`test/auth/route-roles.spec.ts` đáng chú ý: nó đối chiếu TỪNG handler của mọi
controller với bảng phân quyền kỳ vọng, và **fail khi có handler mới chưa được
khai**. Thêm route mà quên khai quyền là test đỏ ngay, không lọt im lặng.

---

## Swagger Export

```bash
pnpm swagger:export
```

Xuất ra:
- `docs/swagger.json` — import vào Postman / Insomnia
- `docs/swagger.yaml` — dùng với swagger-ui-dist hoặc Stoplight

---

## Environment Variables

Danh sách đầy đủ kèm giải thích: **[`.env.example`](.env.example)**. Đừng chép lại
ở đây — hai nơi sẽ lệch nhau.

Hai nguyên tắc:

1. **Env chỉ chứa secret và endpoint theo môi trường.** Các con số cấu hình
   (giới hạn upload, thời hạn presigned URL, hạn mức lưu trữ, trần đính kèm form
   liên hệ) là **hằng số trong code** — [`src/media/media.constants.ts`](src/media/media.constants.ts)
   và [`src/contact/contact.constants.ts`](src/contact/contact.constants.ts) —
   vì chúng không bí mật, không đổi theo môi trường, và để cạnh phần giải thích
   tại sao chọn con số đó thì dễ hiểu hơn nhiều.
2. **Supabase dùng hệ API key mới.** `SUPABASE_SECRET_KEY` (`sb_secret_…`) thay cho
   `service_role` legacy đã bị tắt. Backend không dùng anon/publishable key ở đâu —
   đó là việc của frontend.

---

## Migration dữ liệu cũ

Script `scripts/migrate-relationships.ts` chuyển dữ liệu từ bảng `relationships` cũ sang `member_relationships` mới:

| Dữ liệu cũ | Chuyển thành |
|------------|-------------|
| `PARENT` (from=A, to=B) | `{ parent_id: A, child_id: B, type: BIOLOGICAL }` |
| `CHILD` (from=A, to=B) | `{ parent_id: B, child_id: A, type: BIOLOGICAL }` |
| `SPOUSE` (from=A, to=B) | `{ parent_id: A, child_id: B, type: SPOUSE }` |

```bash
pnpm migrate:relationships
```

Script dùng `upsert` (idempotent — chạy lại nhiều lần vẫn an toàn). Bảng cũ `relationships` giữ nguyên cho backend v1.

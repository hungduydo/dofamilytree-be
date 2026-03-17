# Family Tree API v2

NestJS REST API — phiên bản mới song song với Express backend v1.

| | Backend v1 | Backend v2 |
|---|---|---|
| Framework | Express.js | **NestJS 10** |
| Port | (default) | **3002** |
| Relationship table | `relationships` | **`member_relationships`** |
| Relationship types | PARENT / CHILD / SPOUSE | **BIOLOGICAL / ADOPTED / SPOUSE** |
| Cache | Vercel Blob | **Redis (ioredis)** |
| Queue | — | **BullMQ (4 queues)** |
| Image processing | — | **sharp (compress + resize)** |
| Docs | Swagger | **Swagger `/docs`** |

---

## Cài đặt

```bash
# 1. Cài dependencies
pnpm install

# 2. Copy env
cp .env.example .env
# Điền DATABASE_URL, JWT_SECRET, REDIS_HOST, BLOB_READ_WRITE_TOKEN...

# 3. Generate Prisma client (schema dùng chung từ backend/)
pnpm prisma:generate

# 4. Chạy migration schema (PHẢI chạy từ backend/)
cd ../backend && pnpm exec prisma migrate dev --name add_member_relationships

# 5. (Optional) Migrate dữ liệu cũ sang bảng mới
pnpm migrate:relationships
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
backend-v2/
├── src/
│   ├── prisma/               # PrismaService (global singleton)
│   ├── auth/                 # JWT Guard + Strategy (reuse JWT_SECRET từ v1)
│   ├── members/              # Member + Profile CRUD
│   │   └── dto/              # CreateMemberDto, UpdateMemberDto
│   ├── relationships/        # MemberRelationship CRUD + search
│   │   └── dto/              # CreateRelationshipDto, SearchRelationshipDto
│   ├── tree/                 # Cây gia phả (Redis cache + BFS subtree)
│   ├── events/               # Anniversaries + Events
│   │   └── dto/              # CreateAnniversaryDto, CreateEventDto, ...
│   ├── media/                # Upload ảnh → image-process queue
│   ├── graves/               # Cemetery + GPS nearby search
│   │   └── dto/              # CreateGraveDto, UpdateGraveDto
│   ├── queue/
│   │   ├── queue.module.ts   # BullMQ setup (4 queues)
│   │   └── processors/       # avatar-upload, report-generate, notification, image-process
│   ├── redis.provider.ts     # ioredis client (token: REDIS_CLIENT)
│   ├── utils/
│   │   └── vietnamese-helper.ts  # removeVietnameseTones()
│   ├── app.module.ts
│   └── main.ts               # Port 3002, global prefix /v2
├── prisma/
│   └── schema.prisma         # Copy từ backend/ (có thêm MemberRelationship)
├── test/                     # Unit tests (Jest + @nestjs/testing)
│   ├── members/
│   ├── relationships/
│   ├── tree/
│   ├── events/
│   ├── media/
│   └── graves/
├── scripts/
│   ├── migrate-relationships.ts   # Migrate data cũ → bảng mới (idempotent)
│   └── export-swagger.ts          # Export swagger.json + swagger.yaml → docs/
└── docs/                          # Generated swagger files (gitignored nếu muốn)
```

---

## API Endpoints

Tất cả endpoints đều yêu cầu `Authorization: Bearer <JWT>`.

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

## BullMQ Queues

| Queue | Trigger | Xử lý |
|-------|---------|--------|
| `avatar-upload` | Create/Update member có file avatar | Upload buffer → Vercel Blob → cập nhật `avatar_url` |
| `image-process` | POST `/v2/media/upload` | sharp resize (thumb 300px + full 1200px) → Vercel Blob |
| `report-generate` | Create/Delete member | Tính stats (total, generations, deceased) → Redis |
| `notification` | New member / relationship / event | Log (Phase 1); mở rộng email/push sau |

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

Migration command (chạy từ `backend/`):
```bash
cd backend && pnpm exec prisma migrate dev --name add_member_relationships
```

---

## Tests

```bash
pnpm test           # All tests
pnpm test:watch     # Watch mode
pnpm test:cov       # Coverage report
```

Các file test trong `test/`:

| File | Test Cases |
|------|-----------|
| `members/members.service.spec.ts` | createMember, getMemberById, search, update, delete, queue emission |
| `members/members.controller.spec.ts` | Route → Service delegation |
| `relationships/relationships.service.spec.ts` | add, self-relate, duplicate parent, getChildren, getParents, getSpouses, ancestors, descendants, search |
| `relationships/relationships.controller.spec.ts` | Route → Service delegation |
| `tree/tree.service.spec.ts` | Redis cache hit/miss, regenerate, subtree BFS, stats, CRUD |
| `tree/tree.controller.spec.ts` | Route → Service delegation |
| `events/events.service.spec.ts` | Anniversary CRUD, upcoming, createEvent + notification queue |
| `media/media.service.spec.ts` | upload → image-process queue, delete + blob removal |
| `graves/graves.service.spec.ts` | CRUD, getNearby Haversine filter |

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

```env
# Database (cùng với backend v1)
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# JWT (cùng secret với backend v1)
JWT_SECRET=your-jwt-secret

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # để trống nếu không có password

# Vercel Blob
BLOB_READ_WRITE_TOKEN=xxx

# App
PORT=3002
NODE_ENV=development
```

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
lsof -ti:3002 | xargs kill -9 2>/dev/null; echo "done"

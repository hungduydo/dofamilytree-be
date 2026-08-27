# User & Role — tài liệu tham chiếu

> Dành cho agent/lập trình viên làm FE hoặc sửa BE. Mô tả hệ phân quyền **hiện
> hành** sau đợt rework. Nguồn sự thật trong code: `src/auth/roles.constants.ts`.

## 1. Mô hình

Một **tài khoản** (Supabase Auth user) và một **Member** (một người trong cây phả
hệ) là hai thứ KHÁC nhau. `user_metadata` là bảng nối:

```
Supabase Auth user  ──1:1──  user_metadata  ──0..1──  members ──1:1── profiles
   (email/password)          (roles, claim)          (người trong cây)  (PII)
```

- `user_metadata.user_id` — id tài khoản Supabase.
- `user_metadata.roles: String[]` — quy ước **cao nhất thắng**; service luôn ghi
  đúng một phần tử. Mảng chỉ còn tồn tại vì cột DB là `String[]`.
- `user_metadata.profile_member_id` — Member mà tài khoản này ứng với. `null` =
  chưa được duyệt. **`@unique`**: một Member thuộc tối đa một tài khoản.
- `user_metadata.claim_request: Json?` — thông tin người dùng **tự khai** lúc
  đăng ký. CHƯA xác minh, không phải nguồn sự thật; admin đọc để biết nên gắn
  tài khoản vào Member nào.
- `user_metadata.linked_at` — thời điểm admin duyệt. `null` trên tài khoản đã
  link nghĩa là link do luồng đăng ký **cũ** tạo (không ai duyệt).

## 2. Bốn role

Thứ bậc theo **quyền ghi**: `guest < member < editor < admin`.

| Role | Là ai | Đọc | Ghi |
|---|---|---|---|
| `guest` | Người tự đăng ký, chưa được duyệt | Xem được cây, danh sách/chi tiết member — **trừ** thông tin liên lạc | Không |
| `member` | Người trong dòng họ, đã được admin gắn vào một Member | Đầy đủ, **kể cả** liên lạc | Chỉ hồ sơ **của chính mình**, trong allowlist field; upload media |
| `editor` | Nhân sự thuê ngoài | Như guest — **KHÔNG** xem được liên lạc | Tạo + sửa mọi nội dung; **không xoá** |
| `admin` | Quản trị | Đầy đủ | Toàn quyền, kể cả xoá và quản lý role |

`viewer` của hệ cũ đã bị bỏ. Tài khoản còn sót `roles: ['viewer']` rơi về `guest`
(fail closed).

### ⚠️ Quyền xem PII KHÔNG đơn điệu theo thứ bậc

`editor` xếp **trên** `member` về quyền ghi nhưng **không** được xem thông tin
liên lạc, vì là người ngoài dòng họ. Trong code:

```ts
hasAtLeast(['editor'], 'member')   // true  — quyền ghi
canViewContactPii(['editor'])      // false — quyền đọc PII
```

Đừng bao giờ viết quyền PII bằng `hasAtLeast(roles, 'member')` — nó sẽ âm thầm
cấp PII cho editor. Dùng `canViewContactPii()`.

**4 cột được bảo vệ**: `profiles.phone`, `contactEmail`, `address`, `notes`.

## 3. Vòng đời một tài khoản

```
POST /v2/auth/register
        ↓  roles:['guest'], profile_member_id: null, claim_request: {...}
     [GUEST]  ← chờ admin duyệt (GET /v2/auth/users?status=pending)
        │
        ├── POST /v2/auth/users/:userId/link-member  { memberId }
        │        ↓  gắn vào Member CÓ SẴN, guest → member
        │     [MEMBER]
        │
        └── PUT  /v2/auth/users/:userId/roles  { roles: ['editor'] }
                 ↓
              [EDITOR]  (không cần link member)
```

`DELETE /v2/auth/users/:userId/link-member` gỡ link; chỉ hạ về `guest` nếu đang
là `member` — editor/admin giữ nguyên role.

**Admin đầu tiên** không tạo được qua API (cần admin để cấp admin). Dùng script:

```bash
pnpm bootstrap:admin -- --email=you@example.com --dry-run
```

## 4. Endpoint admin

Tất cả yêu cầu `admin`.

| Method | Path | Ghi chú |
|---|---|---|
| `GET` | `/v2/auth/users?status=pending\|linked\|all&role=&page=&pageSize=` | `status=pending` là hàng đợi duyệt. Trả kèm `email`, `displayName`, `claimRequest`, `profileMember` |
| `PUT` | `/v2/auth/users/:userId/roles` | Body `{ roles: ['editor'] }`. Chuẩn hoá về role cao nhất |
| `POST` | `/v2/auth/users/:userId/link-member` | Body `{ memberId }`. Gắn vào Member có sẵn |
| `DELETE` | `/v2/auth/users/:userId/link-member` | Gỡ link |

**Guardrail** (FE nên hiển thị lỗi tương ứng, đừng nuốt):

| Tình huống | Mã |
|---|---|
| Admin tự đổi role / tự gỡ link của chính mình | `403` |
| Gán `member` cho tài khoản chưa link member nào | `400` |
| `roles` rỗng, hoặc giá trị ngoài 4 role | `400` |
| Tài khoản đã link, muốn link sang member khác | `409` — gỡ link trước |
| Member đã thuộc tài khoản khác | `409` |
| Tài khoản / member không tồn tại | `404` |

## 5. Bảng phân quyền theo route

`public` = không cần token. `auth` = đã đăng nhập (guest vào được). Còn lại là
role **tối thiểu** — `editor` bao gồm cả admin.

> Bảng này được khoá bằng `test/auth/route-roles.spec.ts`. Thêm route mới mà
> quên gắn `@Roles` sẽ làm test đỏ.

| Nhóm | Route | Role |
|---|---|---|
| **auth** | `POST /auth/register`, `/auth/login` | public |
| | `POST /auth/logout`, `/auth/change-password`, `GET /auth/me`, `/auth/roles` | auth |
| | `GET /auth/users`, `PUT .../roles`, `POST\|DELETE .../link-member` | **admin** |
| **members** | `GET /members/committee`, `/notable`, `/stats` | public |
| | `GET /members`, `/search`, `/:id`, `/:id/profile` | auth (lọc PII) |
| | `POST /members` | **editor** |
| | `PUT /members/:id/profile` | **member** (chính chủ) / editor (mọi người) |
| | `DELETE /members/:id`, `POST /members/generations/recompute` | **admin** |
| **relationships** | 7 route `GET` | auth |
| | `POST /members/:memberId/relationships` | **editor** |
| | `DELETE /relationships/:id` | **admin** |
| **tree** | `GET /tree/chart`, `/chart/:memberId`, `/home` | public |
| | `GET /tree`, `/tree/:id`, `/tree/stats` | auth |
| | `POST /tree`, `PUT /tree/:id`, `POST /tree/regenerate` | **editor** |
| | `DELETE /tree/:id` | **admin** |
| **report** | `GET /report/cached` | auth |
| **events** | `GET /events/gallery`, `/events`, `/events/:id` | public |
| | `GET /events/:id/attendees` | auth |
| | `POST /events`, `PUT /events/:id`, `POST\|DELETE /events/:id/attendees` | **editor** |
| | `DELETE /events/:id` | **admin** |
| **anniversaries** | 3 route `GET` | auth |
| | `POST`, `PUT /:id` | **editor** — `DELETE /:id` **admin** |
| **graves** | `GET /graves`, `/nearby`, `/:id` | public |
| | `POST`, `PUT /:id` | **editor** — `DELETE /:id` **admin** |
| **articles** | `GET /articles`, `/:id`, `POST /:id/view` | public |
| | `POST`, `PUT /:id` | **editor** — `DELETE /:id` **admin** |
| **life-events** | `GET /members/:memberId/life-events` | public |
| | `POST` **editor** — `DELETE /:id` **admin** | |
| **memories** | `GET /members/:memberId/memories` | public |
| | `POST` **member** — `DELETE /:id` **admin** | |
| **media** | `GET /media`, `/stats`, `/albums`, `POST /:id/view` | public |
| | `GET /media/member/:memberId` | auth |
| | `POST /upload`, `/upload-url`, `/:id/complete`, `GET /:id/progress` | **member** |
| | `POST /media/albums` | **editor** |
| | `GET /media/blob-storage-usage`, `DELETE /media/:id`, `DELETE /media/albums/:id` | **admin** |
| **queue** | `POST /queue/callback/:task` | Chữ ký QStash, không phải JWT |

## 6. FE cần làm gì

### 6.1 Đọc role từ đâu

`POST /v2/auth/login` và `GET /v2/auth/me` giờ trả thêm:

```jsonc
{
  "roles": ["member"],       // mảng thô, giữ để tương thích
  "role": "member",          // ← DÙNG CÁI NÀY: role hiệu lực, cao nhất thắng
  "profileMemberId": "uuid|null",
  "pendingLink": false       // true = guest chưa được duyệt
}
```

`GET /auth/me` còn trả `claimRequest` để hiện lại thông tin người dùng đã khai.

Ẩn/hiện nút theo `role`, và **luôn xử lý 403** — role có thể bị admin đổi giữa
chừng trong khi token cũ còn hiệu lực (BE đọc role từ DB, không từ token).

### 6.2 Màn hình mới cần có

1. **Sau đăng ký**: `profileMemberId` giờ là `null` và response có
   `status: "pending_link"`. Không còn member để điều hướng tới → hiện màn "chờ
   admin duyệt".
2. **Trang duyệt của admin**: `GET /auth/users?status=pending`, mỗi dòng có
   `claimRequest` (người này tự khai là ai) + ô chọn Member để gắn → gọi
   `link-member`.

### 6.3 Form "sửa hồ sơ của tôi"

`member` chỉ được gửi các field sau khi sửa hồ sơ của chính mình:

```
fullName, gender, birthDate, deathDate, occupation, address,
biography, phone, contactEmail, familyPosition   (+ file avatar)
```

Gửi kèm `generation`, `tree_id`, `clanRole`, `roleTags`, `notes` → **400** (kèm
tên field vi phạm trong message). Cố ý trả 400 chứ không âm thầm bỏ qua, để FE
biết form đang gửi thừa.

Lý do chặn: `generation`/`tree_id` là dữ liệu cấu trúc cây (sửa đời của mình kéo
theo tính lại đời của toàn bộ hậu duệ); `clanRole` bật `isCommittee`/`isNotable`
— tức tự phong mình vào ban trị sự và danh sách người tiêu biểu, hai thứ đang
hiển thị ở endpoint public.

Editor/admin không bị giới hạn này — form quản trị giữ nguyên.

### 6.4 Breaking change phải rà

| # | Thay đổi | Ảnh hưởng |
|---|---|---|
| 1 | Register không tạo Member nữa | Luồng điều hướng sau đăng ký vỡ; `profileMemberId` là `null` |
| 2 | 4 cột liên lạc bị ẩn với guest/editor ở `/members*` | Màn hình đọc `profile.phone` sẽ trống |
| 3 | Các chỗ **nhúng** profile (`/graves*`, `/events*`, `/members/:id/relationships*`, `/tree*`) **không bao giờ** trả 4 cột đó — kể cả admin | Cần số điện thoại thì gọi `GET /members/:id/profile` |
| 4 | `?view=table` bỏ `address` + `phone` với người không được xem PII | Cột bảng BO trống với editor |
| 5 | `GET /auth/roles` không còn `viewer`; `PUT .../roles` 400 với `viewer`, `[]`, chuỗi lạ | Dropdown chọn role |
| 6 | Mọi route ghi giờ có thể 403 | Ẩn nút theo `role`, xử lý 403 tử tế |
| 7 | Media upload yêu cầu `member` trở lên | Guest nhận 403 |
| 8 | `PUT /members/:id/profile` 400 khi member gửi thừa field | Xem 6.3 |
| 9 | Ảnh gửi lúc đăng ký lưu vào `claim_request.avatarUrl`, chỉ gắn vào Member khi admin link | Không hiện ngay sau đăng ký |

## 7. Cho agent sửa BE

### Thêm route mới

1. Controller phải có `@UseGuards(JwtAuthGuard, RolesGuard)` ở cấp class
   (`MembersController` có thêm `CallerMetaGuard`).
2. Gắn `@Roles('editor')` / `@Roles('admin')` — hiểu là "trở lên", **không** cần
   liệt kê admin.
3. Route công khai: `@Public()`.
4. Thêm dòng tương ứng vào `test/auth/route-roles.spec.ts` — spec đó khẳng định
   nó phủ **đúng** mọi handler nên thiếu một dòng là test đỏ.

### Nhúng profile ở service mới

**Không bao giờ** viết `include: { profile: true }`. Dùng:

```ts
import { profileSelectFor } from '../members/members.select';
include: { member: { include: { profile: profileSelectFor(false) } } }
```

`test/members/embedded-profile.spec.ts` quét mã nguồn và sẽ chặn `profile: true`
ở graves/events/relationships/tree/members.

### Cần biết role trong service

Đừng đọc `req.user.roles` (từ JWT — có thể cũ tới 1 ngày). Dùng
`@CurrentMeta() caller: CallerMeta` (role + `profileMemberId` đọc từ DB, memo hoá
một query cho cả request) hoặc `@CanSeePii() canSeePii: boolean`.

### Thêm cột vào `Profile`

Phải thêm vào `PROFILE_FULL_SELECT` (`src/members/members.select.ts`), nếu không
cột đó sẽ không bao giờ xuất hiện trong API. `test/members/members.pii.spec.ts`
đối chiếu với `Prisma.ProfileScalarFieldEnum` nên sẽ báo đỏ.

## 8. Thứ tự triển khai lên production

1. `psql "$DIRECT_URL" -f prisma/manual-migrations/004_user_metadata_claim_request.sql`
   rồi `pnpm prisma:generate`. Cả 3 cột đều nullable/có default → **dữ liệu cũ không đổi**.
2. `pnpm audit:roles` — in bảng toàn bộ tài khoản + cảnh báo. Tài khoản cũ được
   **giữ nguyên** role `member`; dùng bảng này để tự rà và hạ cấp thủ công những
   ai không phải người trong họ.
3. `pnpm bootstrap:admin -- --email=<admin>` — **BẮT BUỘC trước khi deploy**.
   Chưa có admin nào trong DB; deploy phần `@Roles` trước bước này sẽ khiến hệ
   thống thành read-only và không có đường cứu trong app.
4. Set `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` trên Vercel env.
5. Deploy. **Kiểm tra ngay** một job nền chạy được (upload avatar): chữ ký QStash
   cần `rawBody` — nếu sai, mọi job 401 âm thầm.

## 9. Kiểm chứng nhanh

```bash
npm run type-check && npx jest
```

```bash
curl -s -H "Authorization: Bearer $GUEST_TOKEN" "$API/v2/members/$ID/profile" | jq '.profile | has("phone")'
```

Kỳ vọng: `false` với guest/editor, `true` với member/admin. `POST /v2/members`
bằng guest → 403. `POST /v2/queue/callback/avatar-upload` không chữ ký → 401.

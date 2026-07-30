# Audit: Frontend (đang chạy) vs Backend v2 (NestJS)

Ngày: 2026-07-29. Phương pháp: đối chiếu tĩnh (mọi lời gọi API của FE trong `lib/api.ts` + `apiClient` trực tiếp) với route thật của v2, cộng verify động (curl có token v2 hợp lệ + click thật trên trình duyệt, FE trỏ `http://localhost:3002/v2`).

## TL;DR — màn hình theo trạng thái

| Màn hình | Endpoint chính | Trạng thái |
|----------|----------------|-----------|
| Trang chủ `/` | tree/home, events/gallery, members/committee, members/notable | ✅ OK (200) |
| Đăng nhập `/login` | auth/login | ✅ OK |
| DS thành viên `/bo/members` | members, members/search | ✅ OK (cần token v2) |
| Chi tiết TV `/bo/members/[id]` | members/:id (profile nhúng sẵn) | ✅ OK |
| Thêm TV `/bo/members/add` | POST members | ✅ OK |
| Mối quan hệ `/bo/relationships` | members/:id/relationships (GET/POST/DELETE) | ✅ OK (đã fix bug "one parent") |
| Gia phả admin `/bo/trees` | GET/PUT/DELETE tree | ✅ OK |
| Thêm/sửa cây `/bo/trees/add,edit` | POST/GET/PUT tree | ✅ OK |
| Sự kiện `/bo/events` (+add/edit) | events CRUD, events/:id | ✅ OK |
| Ngày kỵ giỗ `/bo/anniversaries` (+add/edit) | anniversaries CRUD + graves | ✅ OK |
| Vị trí mộ `/bo/cemetery` (+add/edit) | graves CRUD | ✅ OK |
| **Dashboard `/bo`** | **report/cached** | ❌ **HỎNG** — số liệu toàn 0 |
| **Cây gia phả công khai `/trees`** | **tree/chart** | ❌ **HỎNG** — visitor bị đá về /login; user đăng nhập gặp 500 |
| **Cây con công khai `/trees/[id]`** | tree/chart/:memberId | ⚠️ Chạy khi đã đăng nhập, nhưng visitor logout bị 401 → /login |

## Chi tiết lỗi (ưu tiên cao → thấp)

### 1. ❌ Dashboard `/bo` — số liệu thống kê toàn 0
- FE gọi `GET /report/cached` → **404** (v2 KHÔNG có report controller). Verify: dashboard hiển thị Tổng thành viên 0 / Đã mất 0 / Thế hệ 0 (backend cũ trả 479/11/42/15).
- v2 có `GET /tree/stats` gần tương đương nhưng: (a) đang **500** vì Redis (xem #2), (b) **shape khác**: trả `totalGenerations` (FE cần `generations`), thiếu hẳn `born20th21st`, trả `generatedAt` (FE cần `lastUpdate`), và không bọc `{ data: { stats } }` như FE `getCachedReport` mong đợi (`res.data.data.stats`).
- Nút "Cập nhật sơ đồ" → `POST /tree/regenerate` → **500** (Redis).
- **Cần:** thêm endpoint `GET /report/cached` ở v2 trả đúng shape `{ data: { stats: { totalMembers, generations, deceased, born20th21st, lastUpdate } } }`, HOẶC sửa FE `getCachedReport` + `SectionCards` map sang `/tree/stats` và bổ sung `born20th21st`/`lastUpdate` vào `getStats`.

### 2. ❌ Upstash Redis không kết nối được → `/tree/chart`, `/tree/stats`, `/tree/regenerate` đều 500
- Instance `willing-leech-67905.upstash.io` (`KV_REST_API_URL` trong `.env.local`) trả **HTTP 000 (unreachable)** — có thể bị xoá/pause (Upstash free tier), hoặc chỉ reachable từ Vercel.
- `tree.service.ts` gọi `this.redis.get/set/del` ở **dòng đầu, không try/catch, không fallback DB**. Redis chết = 500 ngay, dù DB build được (bằng chứng: `/tree/chart/:memberId` — subtree — **không dùng Redis** nên trả **200**).
- **Cần (bất kể Redis sống hay chết):** bọc mọi lời gọi Redis trong `getFamilyTreeChart`/`getStats`/`regenerate` bằng try/catch, khi cache lỗi thì build thẳng từ DB. Cache phải là best-effort, không được làm sập read path lõi. (Và kiểm tra lại instance Upstash còn sống không.)

### 3. ❌ Trang cây gia phả CÔNG KHAI gọi endpoint YÊU CẦU auth → visitor bị đá về /login
- `/(public)/trees` render `FamilyTreeDemo` → `GET /tree/chart`; `/(public)/trees/[id]` render `SubFamilyTree` → `GET /tree/chart/:memberId`.
- Ở v2 chỉ `GET /tree/home` được `@Public`; `tree/chart` và `tree/chart/:memberId` **cần JWT**. Visitor chưa đăng nhập → **401** → interceptor `apiClient` (`status === 401 → window.location.href = '/login'`) **đá thẳng về trang login**. Verify: mở `/trees` khi logout → nhảy về `/login`.
- **Cần:** đánh dấu `@Public()` cho `GET tree/chart` và `GET tree/chart/:memberId` (nếu cây gia phả vốn để công khai) — HOẶC bỏ 2 trang này khỏi route group `(public)`. Cân nhắc thêm: interceptor 401 không nên hard-redirect với request từ trang public.

### 4. ⚠️ Token backend cũ không tương thích v2 (migration note)
- Token do backend Express cũ phát có payload lồng `{ user: {...} }`; v2 phát payload phẳng `{ sub, email, roles, profileMemberId }` và `JwtStrategy` verify theo `sub`. Session cũ còn trong trình duyệt → v2 trả **401** cho mọi route cần auth cho tới khi **logout + login lại**. Không phải bug v2, nhưng người dùng đang có session cũ sẽ bị kẹt — nên cân nhắc bump `NEXTAUTH_SECRET` hoặc ép re-login khi cutover.

### 5. ℹ️ Không ảnh hưởng màn hình (dead/khác biệt nhỏ, ghi nhận)
- `getMemberProfile` FE gọi `GET /members/profiles/:id` → **404** (route thật của v2 là `/members/:id/profile`). Nhưng hàm này **UNUSED** — không màn hình nào gọi.
- `getTreeVisualization` (`GET /tree/visualization`) — **UNUSED**, v2 không có route này.
- `getParents/getChildren/getSpouses/getAncestors/getDescendants` — v2 CÓ đủ (`members/:id/relationships/*`) và trả 200, nhưng FE hiện **chưa dùng** (component `MemberDetailModal` mồ côi). Tính năng backend sẵn sàng, FE chưa ráp.
- `members/committee` & `members/notable` trả 200 nhưng service dùng **heuristic text** (`notes` chứa "committee", `biography` khác rỗng) thay vì cột `isCommittee`/`isNotable`/`committeeRole` đã có sẵn trong schema `Profile`. Không lỗi, nhưng logic lệch với data model — nên thống nhất.

## Ghi chú môi trường verify
- v2 chạy từ `dist` (đã `pnpm run build`) trên `:3002`, FE trên `:3001` (`.env.local` đã trỏ về `localhost:3002/v2`).
- DB dùng chung Supabase `dldqmjwyeustavxyjtbn` với backend cũ → data đồng nhất (kể cả index + backfill quan hệ đã làm trước đó).

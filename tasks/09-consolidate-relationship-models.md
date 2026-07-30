# Task 09 — Hợp nhất 2 model relationship (v1 vs v2)

**Priority:** P1 · **Area:** Architecture · **Est:** L

## Context
`schema.prisma` tồn tại **hai** hệ thống quan hệ song song:
- **v1** `Relationship` (`from_member_id`, `to_member_id`, enum `RelationshipType { PARENT, CHILD, SPOUSE }`) — được dùng thực tế bởi `family-tree.service.ts`, `members.service.ts`, `relationshipService.ts`.
- **v2** `MemberRelationship` (`parent_id`, `child_id`, enum `RelationshipNatureType { BIOLOGICAL, ADOPTED, SPOUSE }`, có `note`) — chỉ xuất hiện ở frontend types/`api.ts`/`MemberDetailModal.tsx`, backend gần như không dùng.

Hai model chồng chéo gây nhầm lẫn, dữ liệu có thể phân mảnh, và logic build cây chỉ đọc v1. Đây là tech debt cần quyết định dứt điểm.

## Scope
1. **Quyết định model chuẩn** (cần xác nhận với user): v2 biểu đạt tốt hơn (phân biệt biological/adopted, tách parent/child rõ ràng) nhưng v1 đang chạy production. Đề xuất: chọn một, viết migration hợp nhất.
2. Nếu giữ v1: xoá `MemberRelationship`, `RelationshipNatureType`, các field `parent_relationships`/`child_relationships`, và dọn tham chiếu frontend (`api.ts`, `MemberDetailModal.tsx`, `types/index.d.ts`).
3. Nếu chuyển sang v2: viết migration copy dữ liệu v1 → v2, cập nhật `family-tree.service`, `members.service`, `relationshipService` đọc v2, rồi xoá v1.
4. Cập nhật tests và docs (`docs/*-api.yml`, `specs/010-profile-model-refactor` nếu liên quan).

## Acceptance criteria
- Chỉ còn **một** model quan hệ trong schema.
- Không còn tham chiếu tới model bị loại ở cả backend và frontend (`grep` sạch).
- Family tree chart vẫn build đúng; tests pass.
- Có migration + hướng dẫn chạy.

## Notes
- Đây là task lớn/nhạy cảm dữ liệu — **hỏi user chọn hướng v1 hay v2 trước khi code**. Cân nhắc tách thành 2 PR: (a) migration + backend, (b) dọn frontend.

## Status: 🔄 In progress (2026-07-29)
**Quyết định của user:** chuyển sang v2 (`MemberRelationship`) làm chuẩn. Lý do thực tế còn mạnh hơn dự đoán ban đầu: `RelationshipManager.tsx` — UI **đang chạy thật** ở `/bo/relationships` — đã được viết theo shape v2 (`parent_id`/`child_id`/`RelationshipNatureType`) từ trước, trong khi backend vẫn chạy v1. Nghĩa là tính năng quản lý quan hệ trên UI **hiện đang lỗi** (frontend gửi `{parentId, childId, type, note}` nhưng backend v1 đọc `{type, targetMemberId}` — luôn nhận `targetMemberId: undefined`). Việc chuyển sang v2 vừa dọn tech debt vừa fix bug thật.

**Phát hiện dữ liệu quan trọng:** cả 2 bảng đều có data thật (v1 `relationships`: 835 rows; v2 `member_relationships`: 478 rows, 482 members). Điều tra kỹ cho thấy v2 là **kết quả một lần migrate KHÔNG ĐẦY ĐỦ** từ v1 — mỗi row v2 có `note: "Migrated from old relationship (type: PARENT)"`, cùng ID với row v1 gốc; script/quy trình đã tạo ra nó không còn trong repo (không tìm thấy). Chỉ 478/835 record v1 (379/736 PARENT + toàn bộ 99/99 SPOUSE) đã được copy; **357 quan hệ PARENT bị bỏ sót**. v2 không có bất kỳ record nào của riêng nó — 100% là bản sao (một phần) của v1.

**Đã làm (bước 1/3 — backfill dữ liệu):**
- Viết script backfill tạm (`backend/scripts/_tmp/backfill_v2.ts`, đã xoá sau khi chạy) — chỉ insert record v1 chưa có ở v2 (match theo ID, idempotent), map `PARENT→BIOLOGICAL`, `SPOUSE→SPOUSE`, giữ nguyên ID/created_at, note theo đúng pattern đã có.
- Chạy backfill trên DB thật: backfill 357 record → v2 giờ có đủ 835/835.
- Verify field-by-field (parent_id/child_id/type khớp v1→v2 theo mapping): **0 mismatch**, khớp 100%.

**Còn lại (bước 2-3, chưa làm — dừng theo yêu cầu user "chỉ backfill trước"):**
- Viết lại backend đọc/ghi qua `member_relationships`:
  - `relationshipService.ts`: rewrite `addRelationship`/`getRelationships`/`deleteRelationship` dùng `parent_id`/`child_id`/`RelationshipNatureType`, khớp đúng shape mà `api.ts`/`RelationshipManager.tsx` đã mong đợi.
  - `api/routes/relationships.ts`: sửa route đọc body `{childId, type, note}` (parentId lấy từ `:memberId` URL param) thay vì `{type, targetMemberId}`.
  - `members.service.ts`: `getMemberById` đổi include từ `from_relationships`/`to_relationships` sang `parent_relationships`/`child_relationships` (khớp field name mà frontend `FamilyMember` type đã mong đợi sẵn — hiện tại field name cũng đang lệch, có thể là bug thứ 2 đang âm thầm tồn tại). `getRelationshipsByMemberId` đổi sang query `memberRelationship`.
  - `family-tree.service.ts`: viết lại phần build `FamilyChartNode.rels` (spouses/father/mother/children) từ `MemberRelationship` thay vì `Relationship` — lưu ý convention SPOUSE dùng chung field `parent_id`/`child_id` làm 2 "slot" tuỳ tiện (do `RelationshipManager.tsx` quy ước "member1 = parent slot, member2 = child slot" kể cả với SPOUSE) — cần xử lý đối xứng 2 chiều khi gom spouse.
- Sau khi code backend đọc/ghi v2 hoạt động đúng và verify kỹ (build + test + review), mới xoá bảng v1 `relationships`, enum `RelationshipType`, field `from_relationships`/`to_relationships` — bước DROP sẽ xin xác nhận riêng vì phá huỷ.
- Frontend: không cần sửa gì thêm — `api.ts`, `types/index.d.ts`, `RelationshipManager.tsx` đã đúng shape v2 sẵn. `MemberDetailModal.tsx` xác nhận là **component mồ côi, không được import ở đâu khác** — có thể cân nhắc xoá luôn (dead code) khi dọn, hoặc để riêng thành task nhỏ khác.

**Việc cần làm tiếp:** nhắn lại để tiếp tục bước 2 (viết lại backend) khi sẵn sàng.

## Bước 2/3 — Viết lại backend + hoàn thiện trang quản lý quan hệ (2026-07-29)

**Backend rewrite (đọc/ghi hoàn toàn qua `MemberRelationship`):**
- `relationshipService.ts`: viết lại `addRelationship(parentId, childId, type, note?)`, `getRelationships`, `deleteRelationship` dùng `member_relationships`. Sửa luôn bug ràng buộc "one parent" (v1: chặn thêm cha/mẹ thứ 2 dù dữ liệu thật có 357/379 trẻ có đủ cả cha lẫn mẹ — xác nhận bằng data audit) → constraint mới: chặn theo **giới tính** (không thể có 2 cha hoặc 2 mẹ, nhưng cho phép cả cha+mẹ). Dùng `AppError` với status code đúng (400/404/409) thay vì generic Error.
- `api/routes/relationships.ts`: sửa body parsing khớp đúng field FE gửi (`childId, type, note`, `parentId` lấy từ URL `:memberId`), thêm `validate(addRelationshipSchema)`.
- `members.service.ts`: `getMemberById` và `getRelationshipsByMemberId` đổi include/query sang `parent_relationships`/`child_relationships` — khớp field name mà frontend `FamilyMember` type vốn đã mong đợi sẵn (bug thứ 2 phát hiện: field name mismatch khiến data này trước đây luôn `undefined` ở FE).
- `family-tree.service.ts`: viết lại toàn bộ phần build `FamilyChartNode.rels` (father/mother/spouses/children) từ `MemberRelationship`. **Verify bằng script so sánh side-by-side thuật toán build cây từ v1 vs v2 trên toàn bộ 482 members**: 0 mismatch. Verify thêm bằng cách chạy chính `FamilyTreeService` đã sửa trên DB thật: 736 BIOLOGICAL/ADOPTED = 376 father-edges + 360 mother-edges — khớp chính xác. `getFamilyTreeStats` cũng đổi sang đếm `memberRelationship`.
- Cập nhật toàn bộ test liên quan (`familyTreeService.test.ts`, `relationshipService.test.ts` viết lại hoàn toàn, `membersService.test.ts`) + bổ sung `RelationshipNatureType` vào mock `@prisma/client` toàn cục (`tests/setup.ts`). Kết quả: **191/191 test pass**, `pnpm build` pass.

**Hoàn thiện trang `/bo/relationships` (RelationshipManager.tsx) theo yêu cầu user:**
- Thêm field **Note (optional)** vào form (schema v2 đã có `note`, UI trước đó chưa expose) — kèm i18n key mới `noteLabel`/`notePlaceholder` (en+vi).
- Cải thiện xử lý lỗi: thay toast generic ("Failed to add relationship") bằng message thật từ backend (`error.response?.data?.message`) — giờ user thấy đúng "This member already has a father." thay vì lỗi mơ hồ.
- Bỏ đoạn code `if/else` trùng lặp vô nghĩa trong `onSubmit` (2 nhánh giống hệt nhau).

**Bug thật phát hiện + fix qua browser verification (KHÔNG phải lỗi do tôi gây ra khi rewrite — tồn tại từ v1 route ban đầu):**
- `DELETE /api/relationships/:relationshipId` — route backend yêu cầu prefix `/members/:memberId/relationships/:relationshipId` nhưng `api.ts` luôn gọi `/relationships/:relationshipId` (không có memberId). Mọi lần bấm xoá quan hệ trên UI **đều trả về 404** trước khi fix. Đã sửa route bỏ prefix `:memberId` (không cần thiết vì `relationshipId` đã unique toàn cục).

**Verify end-to-end qua browser thật (đăng nhập admin@admin.com, thao tác trực tiếp trên `/bo/relationships` với dữ liệu thật):**
1. Xem quan hệ của "Đỗ Nguyên Khang" → hiển thị đúng **cả cha lẫn mẹ** (Đỗ Khắc Hoài + Nguyễn Thị Trinh) — chứng minh bug "one parent" đã hết ảnh hưởng và data hiển thị đúng.
2. Thử thêm lại đúng quan hệ đã tồn tại → toast **"This member already has a father."**, network trả **409 Conflict** đúng status.
3. Thêm quan hệ SPOUSE mới hợp lệ (kèm note) → toast **"Relationship added successfully"**, hiển thị đúng ngay lập tức.
4. Xoá quan hệ vừa tạo → lần đầu **404 Not Found** (bug DELETE), sau khi fix + restart backend → **204 No Content**, toast **"Relationship deleted"**, dữ liệu dọn sạch.

**Phát hiện phụ trong lúc verify (không thuộc scope Task 09, đã sửa tiện thể / cần biết):**
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL`/`BACKEND_URL` trỏ `http://localhost:3002/v2` — một service NestJS **không tồn tại** trong repo (khớp entry rác "Backend v2 (NestJS)" trong `.claude/launch.json`). Nghĩa là local dev frontend trước đây **không gọi được** backend Express thật qua đường chuẩn. Đã tạm sửa trỏ `http://localhost:5124/api` để verify — **cần user xác nhận giữ hay revert.**
- `.claude/launch.json`: thiếu field `cwd` ở cả 3 entries → preview tool chạy nhầm thư mục gốc thay vì `frontend/`/`backend/`. Đã thêm `"cwd": "frontend"` / `"cwd": "backend"`. Entry "Backend v2 (NestJS)" vẫn trỏ tới code không tồn tại — không sửa (ngoài scope, cần user quyết định xoá hay implement).
- Vô tình kill process backend cũ đang chạy trên port 3000 (PID 93865, code cũ từ trước khi sửa) khi restart backend cho việc verify — cần biết nếu đó là terminal riêng của user.

**Còn lại (bước 3/3 — CHƯA làm, cần xác nhận riêng vì phá huỷ):**
- Xoá bảng v1 `relationships`, enum `RelationshipType`, field `from_relationships`/`to_relationships` khỏi `schema.prisma` + migration DROP tương ứng trên DB thật (835 rows, hiện không còn code nào đọc/ghi nhưng vẫn tồn tại song song với `member_relationships`).
- `MemberDetailModal.tsx` (component mồ côi) — cân nhắc xoá luôn khi dọn dead code (Task 14) hoặc để riêng.

## Status: 🔄 2/3 done — chờ xác nhận DROP v1 (2026-07-29)
User quyết định: **giữ bảng v1 `relationships` thêm vài ngày** làm backup song song trước khi xoá vĩnh viễn, để chắc chắn v2 ổn định trong thực tế trước. Code hiện tại 100% đọc/ghi qua v2 — bảng v1 chỉ còn nằm im trong DB, không code nào chạm vào nữa.

**2 config fix phát sinh trong lúc verify đã được giữ lại theo yêu cầu user:**
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL`/`BACKEND_URL` đổi từ `http://localhost:3002/v2` (service không tồn tại) → `http://localhost:5124/api` (backend Express thật).
- `.claude/launch.json`: thêm `"cwd": "frontend"` / `"cwd": "backend"` cho các entries.

**Việc cần làm tiếp (khi user sẵn sàng xác nhận xoá v1):** báo lại để tôi sinh migration `DROP TABLE relationships` + `DROP TYPE "RelationshipType"` + xoá field liên quan khỏi `schema.prisma`, dùng quy trình `prisma migrate diff` → review kỹ → `prisma db execute` (như Task 01), verify lại bằng `prisma migrate diff` cho ra empty diff sau khi áp dụng.

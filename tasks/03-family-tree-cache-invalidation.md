# Task 03 — Family tree cache invalidation khi dữ liệu thay đổi

**Priority:** P0 · **Area:** Backend · **Est:** M

## Context
`backend/src/services/family-tree.service.ts` cache toàn bộ cây gia phả trong `this.cachedData` (in-memory) và Vercel Blob. `getFamilyTreeChart()` và `getFamilySubTreeChart()` đọc từ cache.

Vấn đề: cache **chỉ được regenerate** khi:
- Cache rỗng lúc request đầu, hoặc
- Gọi thủ công `POST /api/tree/regenerate` (admin).

Khi tạo/sửa/xoá **member** (`members.service`) hoặc **relationship** (`relationshipService` / `routes/relationships.ts`), cache **không** được làm mới → người dùng thấy cây gia phả cũ (stale) cho tới khi admin bấm regenerate. Đây là bug dữ liệu, không chỉ là hiệu năng.

## Scope
Thêm cơ chế invalidation. Hai hướng, chọn hướng đơn giản trước:

**Phương án A (khuyến nghị, đơn giản):** expose method `invalidateCache()` trên `FamilyTreeService` (set `this.cachedData = null`), và gọi nó sau mọi mutation ảnh hưởng cây:
- `createMember`, `updateMemberProfile`, `deleteMember` trong `members.service.ts`.
- Các thao tác create/delete relationship trong `relationshipService.ts` / `api/routes/relationships.ts`.

Vì `FamilyTreeService` và `MembersService` được khởi tạo tách rời trong `api/routes.ts`, cần chia sẻ cùng instance hoặc inject `FamilyTreeService` vào các service mutation. Cân nhắc:
- Tạo một singleton/registry cho `FamilyTreeService` và import ở nơi cần, hoặc
- Inject qua constructor trong `routes.ts` (truyền `treeService` vào `MembersService`).

Lần request kế tiếp `getFamilyTreeChart()` thấy `cachedData === null` → tự regenerate.

**Phương án B (nếu muốn tránh regenerate toàn bộ):** cập nhật cache tăng dần — phức tạp hơn, để lại cho sau.

## Acceptance criteria
- Sau khi create/update/delete member hoặc relationship, request tiếp theo tới `/api/tree/chart` trả về dữ liệu phản ánh thay đổi (không cần gọi `/regenerate` thủ công).
- Không phá vỡ luồng khởi tạo service trong `api/routes.ts`.
- Có unit test cho `invalidateCache()` (cache về null) và test rằng mutation gọi tới nó.

## Notes / rủi ro
- Regenerate quét toàn bộ `member.findMany` với include quan hệ — nặng nếu dataset lớn. Task 01 (indexes) giảm chi phí này. Cân nhắc debounce nếu có nhiều mutation liên tiếp (optional).

## Status: ✅ Done (2026-07-29)
- Thêm `FamilyTreeService.invalidateCache()` (set `cachedData = null`).
- Export singleton `familyTreeService` từ `family-tree.service.ts` (dùng chung `prisma` từ `lib/prisma.ts`), `routes.ts` giờ import singleton này thay vì tự tạo instance mới.
- Gọi `familyTreeService.invalidateCache()` sau `createMember`, `updateMemberProfile`, `deleteMember` (members.service.ts) và sau `addRelationship`, `deleteRelationship` (relationshipService.ts).
- Side-fix: `relationshipService.ts` trước đó tự tạo `new PrismaClient()` riêng — đổi sang dùng chung `prisma` từ `lib/prisma.ts` (nhất quán với phần còn lại của codebase, tránh double connection pool). Cập nhật comment trong `relationshipService.test.ts` cho khớp thứ tự mock mới.
- Verify: `pnpm build` pass, `pnpm exec jest tests/unit` — 182/182 tests pass.

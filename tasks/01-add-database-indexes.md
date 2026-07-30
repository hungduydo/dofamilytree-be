# Task 01 — Thêm database indexes vào Prisma schema

**Priority:** P0 · **Area:** Backend/DB · **Est:** S

## Context
`backend/prisma/schema.prisma` hiện có **0 index** (`grep -c "@@index"` = 0). Tất cả foreign key và cột dùng để filter/join đều thiếu index. Các truy vấn nóng bị full table scan:
- `Relationship.from_member_id`, `Relationship.to_member_id`, `Relationship.type` — join liên tục trong `family-tree.service.ts` (`regenerateFamilyTreeChart` include cả `from_relationships`/`to_relationships`).
- `Member.normalized_name` — dùng cho search accent-insensitive (`members.service.searchMembers`).
- `Profile.generation` — filter/group trong stats và search.
- `Anniversary.member_id`, `Comment.target_member_id`, `Comment.author_id`, `MemberRelationship.parent_id`/`child_id`.
- `Anniversary.date`, `Event.date` — sắp xếp/lọc theo ngày.
- `Tree.show` — `getHomeTrees` filter `where: { show: true }`.

## Scope
Thêm `@@index` cho các cột trên. Với search theo `normalized_name` cân nhắc index thường (contains không dùng được full btree cho leading wildcard, nhưng vẫn giúp equality/prefix — ghi chú lại, không bắt buộc trigram trong task này).

Ví dụ:
```prisma
model Relationship {
  // ...
  @@index([from_member_id])
  @@index([to_member_id])
  @@index([type])
  @@map("relationships")
}

model Profile {
  // ...
  @@index([generation])
  @@map("profiles")
}
```
Áp dụng tương tự cho `Member.normalized_name`, `Anniversary(member_id, date)`, `Comment(target_member_id, author_id)`, `MemberRelationship(parent_id, child_id)`, `Event.date`, `Tree.show`.

## Steps
1. Sửa `backend/prisma/schema.prisma`.
2. `cd backend && pnpm exec prisma migrate dev --name add_indexes` (dùng `DIRECT_URL`).
3. `pnpm exec prisma generate`.

## Acceptance criteria
- Migration mới được tạo trong `backend/prisma/migrations/`.
- `pnpm build` pass.
- Không thay đổi logic ứng dụng.

## Out of scope
- Trigram/GIN index cho fuzzy search (task riêng nếu cần).

## Status: ✅ Done (2026-07-29)
Phát hiện DB thật đã **drift** khỏi `schema.prisma` (không có bảng `_prisma_migrations`, DB được quản lý ngoài Prisma Migrate ở đâu đó):
- 3 cột mồ côi `profiles.committeeRole/isCommittee/isNotable` tồn tại trên DB, không có trong code — đã thêm lại vào schema.prisma theo xác nhận của user (không xoá dữ liệu).
- Index đã có sẵn trên DB nhưng thiếu trong schema cũ: `members.name`, `trees.owner_id`, `media.uploader_id`, composite `member_relationships(parent_id/child_id, type)` — đã đồng bộ lại thay vì ghi đè bằng bản đơn giản hơn.
- Migration cuối cùng áp dụng (thuần cộng, không DROP gì): `prisma/migrations/20260729044526_add_indexes/migration.sql` — thêm index cho `anniversaries.date`, `events.date`, `profiles.generation`, `relationships.type`, `trees.show`.
- Verify: `prisma migrate diff` từ DB thật → schema.prisma hiện tại = empty diff (khớp hoàn toàn). `prisma validate` + `pnpm build` pass.
- **Lưu ý cho các task sau:** Repo chưa dùng `_prisma_migrations` tracking table — mọi thay đổi schema tiếp theo nên dùng lại quy trình `prisma migrate diff --from-url ... --to-schema-datamodel ... --script` rồi review kỹ trước khi `prisma db execute`, KHÔNG dùng `prisma migrate dev` (cần interactive, không chạy được trong môi trường non-interactive này) và luôn kiểm tra diff không có `DROP` ngoài ý muốn trước khi áp dụng.

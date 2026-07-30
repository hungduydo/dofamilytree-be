# Task 02 — Fix N+1 query trong `getAllMembers`

**Priority:** P0 · **Area:** Backend · **Est:** S

## Context
`backend/src/services/members.service.ts` → `getAllMembers()` (khoảng dòng 219–255):

```ts
const [members, total] = await this.prisma.$transaction([...]);
const membersWithProfiles = await Promise.all(
  members.map(async (member) => {
    const profile = await this.prisma.profile.findUnique({
      where: { member_id: member.id },
    });
    return { ...member, profile };
  }),
);
```

Đây là N+1: mỗi trang `pageSize` phát sinh thêm `pageSize` query `profile.findUnique`. `Profile` đã là quan hệ 1-1 với `Member` nên có thể dùng `include`.

## Scope
Thay bằng một query duy nhất dùng `include: { profile: true }`:

```ts
const [members, total] = await this.prisma.$transaction([
  this.prisma.member.findMany({
    skip,
    take: pageSize,
    include: { profile: true },
  }),
  this.prisma.member.count(),
]);
return { data: members, total };
```

Rà soát các chỗ tương tự dùng pattern `Promise.all(map(findUnique))`:
- `getFamilyTreeStats` trong cùng file: `membersBorn20th21st` fetch toàn bộ member rồi loop tính năm trong JS — ghi chú lại (xử lý ở Task 12), không bắt buộc trong task này.

## Acceptance criteria
- `getAllMembers` chỉ còn 2 query trong transaction (findMany + count), không còn loop findUnique.
- Response shape giữ nguyên (`{ data, total }`, mỗi item có `profile`).
- `backend/tests/unit/services/membersService.test.ts` vẫn pass (cập nhật mock nếu cần).

## Out of scope
- Tối ưu `getFamilyTreeStats` (Task 12).

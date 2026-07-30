# Task 06 — Bỏ side-effect write trong GET (`getMemberProfileById`)

**Priority:** P1 · **Area:** Backend · **Est:** S

## Context
`backend/src/services/members.service.ts` → `getMemberProfileById()` (dòng ~14–58):
```ts
let profile = await this.prisma.profile.findUnique({ where: { member_id: id } });
if (!profile) {
  profile = await this.prisma.profile.create({ ... }); // WRITE trong hàm đọc
}
```
Một hàm GET/read lại **ghi DB** (auto-create profile) là surprising side-effect:
- Vi phạm CQS, gây write không mong muốn khi chỉ đọc (kể cả từ endpoint public/GET).
- Có thể tạo race condition tạo trùng nếu 2 request đồng thời.
- Về nguyên tắc, `Profile` nên được tạo cùng lúc với `Member` (`createMember` đã làm điều này) → member không có profile là bất thường/dữ liệu cũ.

## Scope
1. Bỏ nhánh tự tạo profile trong `getMemberProfileById`. Nếu thiếu profile → trả về member data với `profile: null` (hoặc default object rỗng), không ghi DB.
2. Đảm bảo `createMember` luôn tạo Profile (đã có) — đây là nơi hợp lệ duy nhất.
3. (Optional) Viết script backfill 1 lần cho các member cũ thiếu profile, đặt trong `backend/scripts/`, chạy thủ công — KHÔNG chạy trong đường đọc.

## Acceptance criteria
- `getMemberProfileById` không còn gọi `profile.create`.
- Không có test nào phụ thuộc vào side-effect tạo profile khi đọc (cập nhật nếu có).
- Đọc member thiếu profile không phát sinh write (verify qua mock: `profile.create` không được gọi).

## Out of scope
- Đổi schema quan hệ Member–Profile.

## Status: ✅ Done (2026-07-29)
- Bỏ nhánh `profile.create` trong `getMemberProfileById`; nếu thiếu profile, trả `fullName` fallback về `member.name` (không ghi DB).
- Không cần script backfill riêng — vì `createMember` đã luôn tạo Profile cùng lúc, member thiếu profile chỉ có thể là dữ liệu cũ hiếm gặp; để lại xử lý thủ công nếu phát sinh.
- Cập nhật test: `creates default profile...` → `returns member data with fallback fullName... (no write)`, assert `prisma.profile.create` không được gọi; `getMemberProfileById (error path)` đổi sang test lỗi từ `profile.findUnique` thay vì `profile.create`.
- Verify: `pnpm build` pass, `pnpm exec jest tests/unit` — 187/187 pass.

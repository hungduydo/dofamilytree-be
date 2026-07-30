# Task 11 — Bỏ `any`, thêm domain types/DTO cho services

**Priority:** P2 · **Area:** Types · **Est:** M

## Context
Các service dùng `any` tràn lan: `createMember(data: any)`, `updateMemberProfile(id, postData: any)`, `getMemberById(): Promise<any | null>`, `memberUpdateData: any`, `profileWhere: any`, v.v. Mất toàn bộ lợi ích type-safety của TypeScript + Prisma, dễ lọt bug (sai tên field, thiếu field).

## Scope
1. Định nghĩa DTO/interface cho input và output các service chính trong `backend/src/types/` (hoặc cạnh service): `CreateMemberInput`, `UpdateMemberProfileInput`, `MemberWithProfile`, `SearchMembersParams`, ...
2. Tận dụng type sinh từ Prisma (`Prisma.MemberCreateInput`, `Prisma.MemberGetPayload<...>`) cho where/include thay vì `any`.
3. Thay chữ ký `any` bằng type cụ thể ở `members.service.ts` trước (nhiều `any` nhất), rồi mở rộng các service khác.
4. Bật chặt hơn nếu dễ: kiểm tra `tsconfig` đã `strict` chưa; cân nhắc `noImplicitAny` cho code mới (không bắt buộc toàn repo trong task này).

## Acceptance criteria
- `members.service.ts` không còn tham số/biến `any` ở các hàm public chính.
- `pnpm build` (tsc) pass, không thêm `@ts-ignore`.
- Tests pass.

## Out of scope
- Refactor toàn bộ mọi `any` trong repo cùng lúc — tập trung services trước.

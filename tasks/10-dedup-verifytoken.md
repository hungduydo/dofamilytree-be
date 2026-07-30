# Task 10 — Gỡ duplicate `verifyToken` trong `auth.controller`

**Priority:** P2 · **Area:** Backend · **Est:** S

## Context
Có hai implementation `verifyToken`:
- `backend/src/middleware/auth.ts` — bản chuẩn, export.
- `backend/src/api/auth.controller.ts` dòng ~26 — định nghĩa **inline** một `verifyToken` riêng, dùng cho `/logout` và `/me`.

Hai bản dễ lệch nhau (khác cách xử lý lỗi/format), khó bảo trì.

## Scope
1. Xoá bản inline trong `auth.controller.ts`.
2. Import và dùng `verifyToken` từ `middleware/auth.ts`.
3. Đảm bảo `req.user` shape mà `/me`, `/logout` mong đợi khớp với `authData.user` mà middleware gán (kiểm tra kỹ — nếu khác, đồng bộ).

## Acceptance criteria
- Chỉ còn một định nghĩa `verifyToken` trong toàn repo backend.
- `/auth/me` và `/auth/logout` hoạt động như cũ (test auth pass).

## Out of scope
- Đổi cơ chế xác thực (Task 04 lo phần secret).

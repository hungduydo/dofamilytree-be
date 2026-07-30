# Task 08 — Security middleware: helmet + rate limit + CORS whitelist

**Priority:** P1 · **Area:** Security · **Est:** S

## Context
`backend/src/server.ts` dùng `cors()` (mặc định — cho phép mọi origin) và **không có** `helmet` (thiếu security headers) cũng như rate limiting (`grep helmet|rate-limit` = rỗng). API auth (`/auth/login`) không giới hạn tần suất → dễ bị brute force.

## Scope
1. Thêm `helmet()` vào chuỗi middleware đầu `server.ts`.
2. Cấu hình CORS whitelist qua env (`ALLOWED_ORIGINS` phân tách bằng dấu phẩy) thay vì mở toàn bộ; giữ credentials nếu cần.
3. Thêm `express-rate-limit` cho các route nhạy cảm (ít nhất `/auth/login`, `/auth/register`, `/report/generate`).

Kiểm tra `backend/package.json` xem `helmet` / `express-rate-limit` đã có chưa. Nếu chưa, xác nhận với user trước khi thêm dependency (Package Management Rules).

## Acceptance criteria
- Response có security headers của helmet.
- CORS chỉ cho phép origin trong whitelist (test 1 origin ngoài whitelist bị chặn).
- `/auth/login` bị rate limit sau N request.
- Không phá vỡ luồng đăng nhập frontend (frontend origin nằm trong whitelist mặc định dev: `http://localhost:3001`).

## Out of scope
- WAF/CDN-level protection.

## Status: ⚠️ Partially done (2026-07-29) — thu hẹp phạm vi theo quyết định user
User chọn **bỏ qua helmet và express-rate-limit** (không thêm dependency mới), chỉ làm CORS whitelist bằng `cors` package đã có sẵn.

**Phát hiện khi implement:** code CORS cũ `origin: [process.env.FRONTEND_URL || '*', 'http://localhost:3001']` thực ra **không** phải "mở toàn bộ" như mô tả gốc — khi `origin` là mảng, thư viện `cors` so khớp chuỗi chính xác với header `Origin` của request; literal `'*'` nằm trong mảng không có ý nghĩa wildcard (chỉ khớp nếu Origin header đúng là chuỗi "*", không xảy ra thực tế). Nghĩa là code cũ đã vô tình hoạt động như whitelist hẹp (chỉ `localhost:3001` + `FRONTEND_URL` nếu set) — nhưng viết gây hiểu lầm và không hỗ trợ nhiều origin (staging/production).

Đã làm:
- `server.ts`: thay bằng whitelist rõ ràng đọc từ `ALLOWED_ORIGINS` (danh sách phân tách dấu phẩy, hỗ trợ nhiều môi trường), luôn cộng thêm `FRONTEND_URL` và `http://localhost:3001` (dev) để tương thích ngược, dedupe bằng `Set`. Bỏ hẳn literal `'*'` gây hiểu lầm.
- Verify: `pnpm build` pass, `pnpm exec jest tests/unit` — 190/190 pass.

**Chưa làm (theo quyết định user, để lại nếu cần sau):** `helmet` (security headers) và `express-rate-limit` cho `/auth/login`, `/auth/register`, `/report/generate` — cần xác nhận thêm dependency trước khi triển khai.

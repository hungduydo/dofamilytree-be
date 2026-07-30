# Task 05 — Centralized error handler + chuẩn hoá API response

**Priority:** P1 · **Area:** Backend · **Est:** M

## Context
Mỗi controller lặp lại pattern try/catch + `res.status(500).json({ success, message, error })`. Hình dạng response không nhất quán giữa các endpoint. `api/routes/relationships.ts` lại gọi `next(error)` nhưng **không có** error-handling middleware nào được đăng ký ở `server.ts` → lỗi rơi vào default handler của Express (trả HTML stacktrace, leak thông tin).

Ngoài ra, service ném `throw new Error('Failed to ...')` làm mất status code gốc (mọi lỗi thành 500, kể cả not-found/validation).

## Scope
1. Tạo `backend/src/middleware/errorHandler.ts`: Express error middleware `(err, req, res, next)` trả JSON chuẩn:
   ```json
   { "success": false, "message": "...", "code": "OPTIONAL_CODE" }
   ```
   - Log qua `logger.error` (không trả stacktrace ra client ở production).
   - Map các loại lỗi phổ biến (Prisma `P2025` not found → 404, `P2002` unique → 409, validation → 400).
2. Định nghĩa lớp lỗi `AppError` (message + statusCode) để service/controller ném có ngữ nghĩa.
3. Đăng ký `app.use(errorHandler)` **cuối cùng** trong `server.ts` (sau routes).
4. Refactor dần controllers dùng `next(err)` thay vì tự `res.status(500)` (có thể làm từng controller; ít nhất chuẩn hoá + đăng ký handler + relationships route vốn đã `next(error)`).

## Acceptance criteria
- Có error-handling middleware đăng ký ở `server.ts`.
- Route `relationships.ts` không còn ném lỗi ra default handler (test 1 case lỗi trả JSON chuẩn, không phải HTML).
- Production không leak stacktrace.
- Không đổi hình dạng success response hiện có.

## Out of scope
- Viết lại toàn bộ controllers cùng lúc (làm dần được).

## Status: ✅ Done (2026-07-29)
**Điều chỉnh so với mô tả gốc:** phát hiện `server.ts` đã có sẵn 1 global error handler (đăng ký đúng vị trí, sau routes) — mô tả ban đầu "không có error-handling middleware nào" không chính xác. Vấn đề thật là: handler cũ luôn trả 500 (không có `Error` nào trong code từng set `.status`), và response shape `{message, error}` khác với phần lớn controller khác dùng `{success:false, message}`.

Đã làm:
- Thêm `backend/src/utils/AppError.ts` (class `AppError extends Error { statusCode }`).
- Thêm `backend/src/middleware/errorHandler.ts`: nhận diện `AppError` (dùng statusCode có sẵn), map lỗi Prisma known-error (`P2025`→404, `P2002`→409, `P2003`→400, khác→500 "Database error"), fallback cho `Error` thường (ẩn message ở production, hiện ở dev). Response chuẩn `{ success: false, message }`.
- `server.ts`: thay handler inline bằng `app.use(errorHandler)`.
- `relationshipService.ts`: đổi 4 chỗ `throw new Error(...)` thành `throw new AppError(msg, statusCode)` với code đúng ngữ nghĩa (400/404/409) — đây là consumer thực tế duy nhất của `next(err)` trong routes hiện tại.
- `tests/setup.ts`: mock `@prisma/client` toàn cục thiếu export `Prisma.PrismaClientKnownRequestError` — đã bổ sung mock class để `instanceof` check hoạt động trong test.
- Test mới: `tests/unit/middleware/errorHandler.test.ts` (5 cases).
- Verify: `pnpm build` pass, `pnpm exec jest tests/unit` — 187/187 pass.

**Còn lại (out of scope, để task sau nếu cần):** đa số controllers khác vẫn tự `try/catch` + `res.status(500).json(...)` riêng thay vì `next(err)` — chưa refactor đồng loạt.

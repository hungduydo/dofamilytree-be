# Task 07 — Input validation (zod) cho controllers

**Priority:** P1 · **Area:** Backend · **Est:** M

## Context
Controllers hầu như không validate input. `members.controller.ts` chỉ có `validatePagination` thủ công. Các endpoint POST/PUT (create member, update profile, create tree, anniversary, event, cemetery...) nhận `req.body` thô rồi truyền thẳng vào service (`createMember(data)` destructure `any`). Rủi ro: dữ liệu bẩn vào DB, lỗi runtime, khó trả 400 rõ ràng.

Frontend đã dùng `zod` (React Hook Form + Zod) — nên dùng cùng công cụ ở backend cho nhất quán. Kiểm tra `backend/package.json` xem `zod` đã có chưa; nếu chưa, hỏi user trước khi thêm dependency (theo Package Management Rules trong CLAUDE.md).

## Scope
1. Tạo `backend/src/schemas/` chứa zod schema cho các payload chính: `createMember`, `updateMemberProfile`, `createTree`/`updateTree`, `createAnniversary`, `createEvent`, `createCemetery`, `searchMembers` query.
2. Tạo helper middleware `validate(schema)` parse `req.body`/`req.query`, gắn kết quả đã parse, ném lỗi 400 (dùng `AppError` từ Task 05 nếu có) khi fail.
3. Áp dụng middleware vào các route tương ứng.

## Acceptance criteria
- Các endpoint create/update chính có validation, trả 400 với message rõ ràng khi payload sai.
- Không tự ý nâng/hạ version package; nếu cần thêm `zod` vào backend, xác nhận với user trước.
- Có ít nhất vài test: payload hợp lệ pass, payload thiếu field bắt buộc trả 400.

## Out of scope
- Validation cho mọi endpoint phụ (làm dần).

## Status: ✅ Done (2026-07-29)
`zod` đã sẵn có trong `backend/package.json` (`^3.23.8`) — không cần thêm dependency.

Đã làm:
- `backend/src/middleware/validate.ts`: middleware `validate(schema, source)` dùng `schema.safeParse`, lỗi → `next(new AppError(message, 400))` (tận dụng error handler từ Task 05), thành công → ghi đè `req[source]` bằng data đã parse/coerce.
- `backend/src/schemas/`: `member.schema.ts` (createMember, updateMemberProfile, searchMembers query), `tree.schema.ts`, `anniversary.schema.ts` (dùng `z.coerce.date()`), `cemetery.schema.ts`, `event.schema.ts` (có `multipartBoolean` helper coerce string 'true'/'false' từ multipart form vì route event dùng `upload.array('images')`).
- Áp dụng `validate()` vào: `members.controller.ts` (POST /profiles, PUT /profiles/:id, GET /search — xoá luôn helper `getQueryParamAsString` không còn dùng), `tree.controller.ts` (POST/PUT), `anniversary.controller.ts` (POST/PUT — bỏ luôn `new Date(date)` thủ công vì schema đã coerce), `cemetery.controller.ts` (POST/PUT), `event.controller.ts` (POST/PUT — chú ý `validate()` đặt sau `upload.array('images')` để đọc được multipart body đã parse).
- Xoá các check `if (!field) return res.status(400)...` thủ công trùng lặp ở các route trên (đã do middleware đảm nhiệm).
- Test mới: `tests/unit/middleware/validate.test.ts` (3 cases: pass + coerce, thiếu field → AppError 400, validate query).
- Verify: `pnpm build` pass, `pnpm exec jest tests/unit` — 190/190 pass.

**Phát hiện phụ (không sửa, ghi chú lại):** `members.controller.ts` yêu cầu `gender` khi tạo member (giữ nguyên trong schema để không đổi hành vi API), nhưng `MembersService.createMember` **không bao giờ lưu `gender` vào DB** — field bị âm thầm rơi mất từ trước khi có task này. Là bug tiền-existing, nên xử lý riêng (có thể thêm vào Task 11 khi dọn `any`/DTO).
**Lưu ý:** Controllers không có test riêng (`jest.config.js` loại `src/api/**` khỏi coverage — "covered by integration/E2E tests"), và repo hiện không có suite integration/contract nào chạy được (`test:contract`/`test:integration` trong CLAUDE.md không thấy script tương ứng trong `package.json`). Thay đổi controller được verify qua build + review thủ công + service-level tests.

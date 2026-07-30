# Task 04 — Bỏ hardcoded `JWT_SECRET` fallback + fail-fast env

**Priority:** P0 · **Area:** Security · **Est:** S

## Context
`backend/src/middleware/auth.ts`:
```ts
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';
```
Fallback secret hardcode = lỗ hổng bảo mật nghiêm trọng: nếu deploy quên set `JWT_SECRET`, mọi token đều ký bằng secret công khai trong source → ai cũng forge được JWT. Chuỗi `'supersecretjwtkey'` cũng có thể trùng ở nhiều nơi (kiểm tra `auth.service.ts`).

## Scope
1. Bỏ fallback. Đọc secret một lần, throw ngay khi khởi động nếu thiếu:
   ```ts
   const JWT_SECRET = process.env.JWT_SECRET;
   if (!JWT_SECRET) {
     throw new Error('JWT_SECRET is not set — refusing to start.');
   }
   ```
   Đặt ở module khởi tạo (hoặc một `config/env.ts` tập trung) để fail-fast lúc boot, không phải lúc request đầu.
2. Grep toàn repo tìm mọi nơi dùng `supersecretjwtkey` / đọc `JWT_SECRET` (ít nhất `auth.service.ts`) và áp dụng cùng nguyên tắc — dùng chung một nguồn config.
3. Cập nhật `.env.example`/`docs` ghi rõ `JWT_SECRET` bắt buộc (nếu có file example).

## Acceptance criteria
- Không còn chuỗi literal `supersecretjwtkey` trong `backend/src`.
- App throw rõ ràng khi thiếu `JWT_SECRET` thay vì chạy với secret mặc định.
- Test hiện có set `JWT_SECRET` trong setup (kiểm tra `backend/jest` setup; thêm nếu thiếu để test không vỡ).

## Out of scope
- Xoay vòng/khoá bất đối xứng (RS256) — task riêng nếu muốn.

## Status: ✅ Done (2026-07-29)
- `middleware/auth.ts`: bỏ `|| 'supersecretjwtkey'`, đổi sang resolve `JWT_SECRET` lazy per-request (giống pattern đã có sẵn ở `auth.controller.ts`) — nếu thiếu env var, trả 500 "Server misconfiguration" thay vì ký/verify bằng secret công khai. Lý do dùng lazy-resolve thay vì throw ở module load: tránh crash các bootstrap step (vd swagger export) chạy trước khi env được load, theo đúng comment đã có trong `auth.controller.ts`.
- `auth.controller.ts` đã có sẵn pattern đúng (`getJwtSecret()` throw nếu thiếu) — không cần sửa.
- Thêm `process.env.JWT_SECRET ||= 'test-jwt-secret'` vào `tests/setup.ts` vì giờ không còn fallback hardcode nên test cần tự cấp secret.
- Verify: `pnpm build` pass, `pnpm exec jest tests/unit` — 182/182 tests pass.
- **Ghi chú:** `auth.controller.ts` vẫn có bản `verifyToken` inline riêng (duplicate) — xử lý ở Task 10.

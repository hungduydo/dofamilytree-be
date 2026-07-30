# Task 13 — Dọn logging

**Priority:** P2 · **Area:** Backend · **Est:** S

## Context
Vấn đề logging trong backend:
- `family-tree.service.ts` và `tree.controller.ts` import `{ info, log }` / `{ info }` từ `node:console` — lẫn lộn với `logger` (winston/pino) đã có ở `src/logger.ts`. Không nhất quán, log không đi qua transport chuẩn.
- `regenerateFamilyTreeChart` log **toàn bộ member IDs** mỗi lần chạy: `logger.info(\`Member IDs: ${members.map(m => m.id).join(', ')}\`)` — spam log, có thể lộ ID hàng loạt, tốn I/O khi dataset lớn.
- `createTree` gọi `info(data)` (log nguyên payload).
- Còn ~4 `console.log` trong `backend/src`.

## Scope
1. Thay mọi import từ `node:console` bằng `logger` từ `src/logger.ts`. Xoá các import `{ info, log }`.
2. Bỏ dòng log "Member IDs: ..." (hoặc hạ xuống `logger.debug` và chỉ log **số lượng**, không log toàn bộ ID).
3. Thay `console.log` còn sót bằng `logger`.
4. Đảm bảo không log dữ liệu nhạy cảm/PII toàn phần ở mức info.

## Acceptance criteria
- `grep -rn "node:console" backend/src` = rỗng.
- `grep -rn "console.log" backend/src` = rỗng.
- Regenerate family tree không còn dump toàn bộ member IDs ở mức info.

## Out of scope
- Đổi thư viện logging.

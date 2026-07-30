# Task 14 — Tách các component frontend quá lớn

**Priority:** P2 · **Area:** Frontend · **Est:** M

## Context
Một số file frontend quá lớn, khó bảo trì/test:
- `frontend/src/components/ui/sidebar.tsx` — 726 dòng (component shadcn base, có thể để nguyên nếu là generated — kiểm tra trước).
- `frontend/src/components/member-table.tsx` — 486 dòng.
- `frontend/src/app/bo/anniversaries/edit/[id]/page.tsx` — 350 dòng.
- `frontend/src/components/Book.tsx` — 334 dòng.
- `frontend/src/components/RelationshipManager.tsx` — 281 dòng.
- Nhiều page `bo/*/add|edit` 200–350 dòng lặp pattern form.

## Scope
1. Ưu tiên `member-table.tsx` và `RelationshipManager.tsx` (logic app, không phải shadcn base):
   - Tách phần table columns, row actions, filter/toolbar, pagination thành sub-component/hook.
   - Rút logic data fetching/mutation ra custom hook (`useMembersTable`...).
2. Với các page form `add`/`edit` lặp lại (anniversaries, cemetery, events, trees): trích form dùng chung + zod schema chia sẻ giữa add và edit thay vì copy 2 bản.
3. **Không** đụng `components/ui/*` nếu là file shadcn generated (đối chiếu `components.json`) — trừ khi cần.

## Acceptance criteria
- File mục tiêu (member-table, RelationshipManager) giảm đáng kể kích thước, logic tách vào hook/sub-component có thể test riêng.
- Không đổi hành vi UI; `pnpm lint` và `pnpm test` (Jest) pass; E2E liên quan (`members-crud`, `relationships-crud`) pass.
- `pnpm knip` không tăng số unused.

## Out of scope
- Redesign UI. Đây là refactor cấu trúc, giữ nguyên giao diện.

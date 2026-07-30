# Task 12 — Migrate `birthDate`/`deathDate` từ String → DateTime

**Priority:** P2 · **Area:** Backend/DB · **Est:** M

## Context
Trong `schema.prisma`, `Member.birthDate` và `Member.deathDate` là `String?`. Hệ quả:
- `members.service.getFamilyTreeStats()` phải `findMany` **toàn bộ** member có `birthDate` rồi loop trong JS để đếm người sinh 1901–2100 (`membersBorn20th21st`) — không thể filter/aggregate ở DB, không dùng được index, O(n) mỗi lần gọi.
- `searchMembers` phải build range date thủ công và filter `profile.birthDate` (ở Profile, khác chỗ với `Member.birthDate` — lưu ý dữ liệu ngày đang nằm rải rác ở cả Member lẫn Profile).
- Nhiều chỗ `new Date(member.birthDate)` có thể ném lỗi với chuỗi không hợp lệ (đã thấy try/catch phòng hờ trong `family-tree.service`).

## Scope
1. Chuẩn hoá kiểu ngày. Đề xuất chuyển `Member.birthDate`/`deathDate` sang `DateTime?`. Vì gia phả có thể chỉ biết năm/ngày một phần, cân nhắc: giữ String hiển thị + thêm cột `DateTime?` chuẩn hoá để query — **xác nhận với user** cách xử lý ngày không đầy đủ (chỉ có năm) trước khi migrate.
2. Viết migration + script backfill parse chuỗi hiện có sang DateTime (chuỗi không parse được → null, log lại).
3. Cập nhật `getFamilyTreeStats` dùng `count` với `where` khoảng ngày ở DB thay vì loop JS.
4. Cập nhật `searchMembers`, `family-tree.service` dùng field mới.
5. Làm rõ nguồn sự thật cho ngày sinh: `Member.birthDate` vs `Profile.birthDate` (dedupe nếu trùng mục đích).

## Acceptance criteria
- `getFamilyTreeStats` không còn `findMany` toàn bộ member để đếm năm — dùng aggregate/count có điều kiện ngày.
- Migration + backfill script có sẵn, chạy được, có xử lý chuỗi lỗi.
- Tests pass.

## Notes
- Nhạy cảm dữ liệu — **hỏi user về cách biểu diễn ngày không đầy đủ** trước khi đổi kiểu. Có thể tách: (a) thêm cột DateTime + backfill, (b) chuyển query, (c) dọn String cũ.

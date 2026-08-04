/**
 * Allowlist cho `?view=` của `GET /v2/members`. Cùng cơ chế MEMBER_SORT_FIELDS:
 * giá trị từ query string chỉ đi tiếp nếu nằm trong danh sách; giá trị lạ rơi
 * về `full`.
 *
 * - `full`  (MẶC ĐỊNH) — giữ nguyên shape hiện tại. FE sinh type từ swagger nên
 *           mặc định KHÔNG được đổi.
 * - `table` — đủ cột cho bảng data BO (bỏ biography/notes — hai cột nặng nhất).
 * - `lite`  — id + name + avatar + generation, cho các nhu cầu tối giản.
 *
 * Các endpoint khác (/search, /:id, /:id/profile) mỗi cái phục vụ MỘT mục đích
 * duy nhất nên có shape cố định — KHÔNG nhận param này.
 */
export const MEMBER_VIEWS = ['lite', 'table', 'full'] as const;
export type MemberView = (typeof MEMBER_VIEWS)[number];

/** Chuẩn hoá param thô: rỗng / không hợp lệ → 'full'. */
export function resolveView(raw: unknown): MemberView {
  return typeof raw === 'string' && (MEMBER_VIEWS as readonly string[]).includes(raw)
    ? (raw as MemberView)
    : 'full';
}

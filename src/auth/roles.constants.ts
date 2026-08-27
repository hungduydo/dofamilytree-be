/**
 * Nguồn sự thật DUY NHẤT về role. Trước đây `AVAILABLE_ROLES` nằm trong
 * auth.service.ts với các chuỗi `permissions` mà không dòng code nào đọc — role
 * chỉ tồn tại trên giấy. File này thay thế nó bằng thứ guard thật sự dùng được.
 *
 * BỐN role, xếp theo QUYỀN GHI tăng dần:
 *   guest  — người tự đăng ký, chưa được duyệt. Chỉ đọc.
 *   member — người trong dòng họ, đã được admin gắn vào một Member có sẵn.
 *   editor — nhân sự thuê ngoài: sửa được dữ liệu, KHÔNG phải người trong nhà.
 *   admin  — toàn quyền, kể cả xoá và quản lý role.
 *
 * `viewer` của hệ cũ bị bỏ: nó chưa từng được gắn vào route nào và trùng vai
 * trò với `guest`. roleRank() trả -1 cho nó ⇒ tài khoản còn sót 'viewer' rơi về
 * `guest`, tức là mất quyền chứ không phải được thêm quyền (fail closed).
 */

export const ROLE_ORDER = ['guest', 'member', 'editor', 'admin'] as const;
export type Role = (typeof ROLE_ORDER)[number];

export const ROLE_RANK = Object.fromEntries(
  ROLE_ORDER.map((role, index) => [role, index]),
) as Record<Role, number>;

/** Role lạ (kể cả 'viewer' của hệ cũ) → -1, tức thấp hơn cả guest. */
export function roleRank(raw: string): number {
  return ROLE_RANK[raw as Role] ?? -1;
}

/**
 * Một tài khoản có thể mang nhiều role trong mảng `roles` (dữ liệu cũ). Quy ước:
 * CAO NHẤT THẮNG. Rỗng / toàn role lạ / null → 'guest'. Không bao giờ throw —
 * hàm này chạy trong guard, ném ở đó biến lỗi dữ liệu thành 500.
 */
export function highestRole(roles?: string[] | null): Role {
  let best: Role = 'guest';
  for (const raw of roles ?? []) {
    if (roleRank(raw) > ROLE_RANK[best]) best = raw as Role;
  }
  return best;
}

export function hasAtLeast(roles: string[] | null | undefined, min: Role): boolean {
  return ROLE_RANK[highestRole(roles)] >= ROLE_RANK[min];
}

/**
 * Ai được xem phone/contactEmail/address/notes.
 *
 * CỐ Ý là một Set chứ KHÔNG phải hasAtLeast(roles, 'member'): quyền xem PII
 * không đơn điệu theo thứ bậc. `editor` xếp TRÊN `member` về quyền ghi nhưng là
 * người ngoài dòng họ, nên KHÔNG được xem thông tin liên lạc. Viết thành
 * hasAtLeast là tự động cấp PII cho editor — đúng thứ ta đang tránh.
 */
export const PII_ROLES: ReadonlySet<Role> = new Set<Role>(['member', 'admin']);

export function canViewContactPii(roles?: string[] | null): boolean {
  return PII_ROLES.has(highestRole(roles));
}

/**
 * Catalog cho GET /v2/auth/roles. Giữ shape {id,name,permissions} như cũ để FE
 * không vỡ; `permissions` giờ mô tả đúng những gì guard thực thi, và `rank` cho
 * FE tự so sánh mà không hardcode thứ tự.
 */
export const AVAILABLE_ROLES = [
  {
    id: 'guest-role-id',
    name: 'guest',
    rank: ROLE_RANK.guest,
    permissions: ['read:public'],
  },
  {
    id: 'member-role-id',
    name: 'member',
    rank: ROLE_RANK.member,
    permissions: ['read:contact', 'write:own_profile', 'upload:media'],
  },
  {
    id: 'editor-role-id',
    name: 'editor',
    rank: ROLE_RANK.editor,
    permissions: ['write:content'],
  },
  {
    id: 'admin-role-id',
    name: 'admin',
    rank: ROLE_RANK.admin,
    permissions: ['read:contact', 'write:content', 'delete:any', 'manage:roles'],
  },
] as const;

import { Prisma } from '@prisma/client';

/**
 * Các mảnh `select` dùng chung cho members. Tách file riêng để:
 *   1. shape trả về ở service và DTO tài liệu hoá không trôi khỏi nhau;
 *   2. đổi cột bảng BO chỉ phải sửa MỘT hằng.
 *
 * LƯU Ý PRISMA: `select` và `include` KHÔNG được đứng cạnh nhau ở CÙNG một cấp
 * (PrismaClientValidationError). Nhưng `select` LỒNG bên trong một quan hệ của
 * `include` thì hợp lệ — nhánh `full` khai thác đúng điều đó để thu hẹp `tree`.
 *
 * Dùng `satisfies` để vừa giữ literal type (Prisma suy ra đúng kiểu kết quả),
 * vừa validate tên cột theo model.
 */

/** Khớp chính xác MemberTreeBriefDto — thứ swagger vẫn luôn hứa. */
export const TREE_BRIEF_SELECT = {
  id: true,
  title: true,
} satisfies Prisma.TreeSelect;

/** Cho <select>/autocomplete và người thân. Đủ để render một option, không hơn. */
export const MEMBER_LITE_SELECT = {
  id: true,
  name: true,
  avatar_url: true,
  generation: true,
} satisfies Prisma.MemberSelect;

/**
 * Cột profile mà bảng BO thực sự render. CỐ Ý bỏ `biography` và `notes` — hai
 * cột free-text dài nhất, chiếm phần lớn payload mà bảng không hiển thị. Cũng
 * bỏ id/member_id/fullName/created_at/updated_at/contactEmail (bảng không dùng).
 */
export const PROFILE_TABLE_SELECT = {
  occupation: true,
  address: true,
  phone: true,
  familyPosition: true,
  roleTags: true,
  committeeRole: true,
  isCommittee: true,
  isNotable: true,
} satisfies Prisma.ProfileSelect;

export const MEMBER_TABLE_SELECT = {
  id: true,
  name: true,
  avatar_url: true,
  gender: true,
  birthDate: true,
  deathDate: true,
  tree_id: true,
  generation: true,
  created_at: true,
  profile: { select: PROFILE_TABLE_SELECT },
  tree: { select: TREE_BRIEF_SELECT },
} satisfies Prisma.MemberSelect;

/** Cạnh quan hệ, KHÔNG kèm member ở hai đầu (người gọi tự chọn parent/child). */
export const RELATIONSHIP_EDGE_SELECT = {
  id: true,
  parent_id: true,
  child_id: true,
  type: true,
  note: true,
  created_at: true,
} satisfies Prisma.MemberRelationshipSelect;

/**
 * ─── LỌC THÔNG TIN LIÊN LẠC ─────────────────────────────────────────────────
 *
 * Bốn cột dưới đây là PII: chỉ `member` (người trong dòng họ) và `admin` được
 * xem. `guest` (chưa duyệt) và `editor` (nhân sự thuê ngoài) thì KHÔNG — xem
 * PII_ROLES trong src/auth/roles.constants.ts để hiểu vì sao editor xếp trên
 * member về quyền ghi mà vẫn không được xem.
 *
 * Vì sao lọc bằng `select` chứ không bằng interceptor cắt field ở response:
 * interceptor chỉ cắt những shape mà ai đó nhớ đăng ký, nên mọi endpoint MỚI
 * nhúng `member.profile` sẽ rò theo mặc định. Select thì ngược lại — muốn rò
 * phải cố tình viết `profile: true`, thứ grep ra được và test được.
 */
export const PROFILE_CONTACT_FIELDS = ['phone', 'contactEmail', 'address', 'notes'] as const;

/**
 * Toàn bộ cột Profile. PHẢI liệt kê tay (không dùng `profile: true`) để có một
 * bản đối chiếu cho PROFILE_PUBLIC_SELECT bên dưới. Cột Profile mới thêm vào
 * schema sẽ KHÔNG tự xuất hiện ở đây — test/members/members.pii.spec.ts đối
 * chiếu với Prisma.ProfileScalarFieldEnum để CI báo lỗi thay vì âm thầm mất cột.
 */
export const PROFILE_FULL_SELECT = {
  id: true,
  member_id: true,
  fullName: true,
  generation: true,
  biography: true,
  occupation: true,
  address: true,
  notes: true,
  phone: true,
  contactEmail: true,
  familyPosition: true,
  roleTags: true,
  created_at: true,
  updated_at: true,
  committeeRole: true,
  isCommittee: true,
  isNotable: true,
} satisfies Prisma.ProfileSelect;

/** PROFILE_FULL_SELECT trừ 4 cột liên lạc. */
export const PROFILE_PUBLIC_SELECT = (() => {
  const select = { ...PROFILE_FULL_SELECT } as Record<string, boolean>;
  for (const field of PROFILE_CONTACT_FIELDS) delete select[field];
  return select as Omit<typeof PROFILE_FULL_SELECT, (typeof PROFILE_CONTACT_FIELDS)[number]>;
})();

/**
 * Dùng ở MỌI chỗ nhúng profile: `include: { profile: profileSelectFor(canSeePii) }`.
 * Mặc định của mọi call site là `false` — thiếu luồng role phải dẫn tới ÍT dữ
 * liệu hơn, không phải nhiều hơn.
 */
export function profileSelectFor(canSeePii: boolean) {
  return { select: canSeePii ? PROFILE_FULL_SELECT : PROFILE_PUBLIC_SELECT };
}

/** Bảng BO cho người không được xem liên lạc: bỏ address + phone. */
export const PROFILE_TABLE_PUBLIC_SELECT = {
  occupation: true,
  familyPosition: true,
  roleTags: true,
  committeeRole: true,
  isCommittee: true,
  isNotable: true,
} satisfies Prisma.ProfileSelect;

export const MEMBER_TABLE_PUBLIC_SELECT = {
  ...MEMBER_TABLE_SELECT,
  profile: { select: PROFILE_TABLE_PUBLIC_SELECT },
} satisfies Prisma.MemberSelect;

export const memberTableSelect = (canSeePii: boolean) =>
  canSeePii ? MEMBER_TABLE_SELECT : MEMBER_TABLE_PUBLIC_SELECT;

/**
 * Cột mà một `member` được tự sửa trên hồ sơ CỦA CHÍNH MÌNH.
 *
 * Cố ý KHÔNG có: `generation`, `tree_id` (dữ liệu cấu trúc cây — sửa đời của
 * mình là kéo theo tính lại đời của toàn bộ hậu duệ), `clanRole` (bật
 * isCommittee/isNotable ⇒ tự phong mình vào ban trị sự và danh sách người tiêu
 * biểu, cả hai đang hiển thị ở endpoint public), `roleTags` và `notes` (ghi chú
 * do dòng họ quản lý, không phải người đó tự khai).
 */
export const MEMBER_SELF_EDITABLE_FIELDS = [
  'fullName',
  'gender',
  'birthDate',
  'deathDate',
  'occupation',
  'address',
  'biography',
  'phone',
  'contactEmail',
  'familyPosition',
] as const;

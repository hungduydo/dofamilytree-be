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

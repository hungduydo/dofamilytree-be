/**
 * Mã `clanRole` → câu chữ hiển thị.
 *
 * DÙNG CHUNG bởi `GET /members/committee` (trang chủ) và `GET /contact/info` →
 * `board[]` (trang liên hệ). Để mỗi bên tự giữ một bảng là mở đường cho đúng
 * cái lỗi vừa sửa: hai màn hình cùng nói về một người mà hiện hai chức danh.
 *
 * Bảng này khớp `RoleBadge.tsx` bên FE — FE render chuỗi NGUYÊN VĂN, nên trả mã
 * thô ra là trang hiện chữ "TRUONG_TOC" cho cả dòng họ đọc.
 *
 * Giá trị lạ đi thẳng qua: `committeeRole` là cột text tự do, admin hoàn toàn
 * có thể gõ "Thủ quỹ" và chữ đó phải hiện đúng như đã gõ.
 */
export const COMMITTEE_ROLE_LABELS: Record<string, string> = {
  TRUONG_TOC: 'Trưởng tộc',
  PHO_TRUONG_TOC: 'Phó trưởng tộc',
  // Dòng họ không có trưởng tộc mà chia việc trong ban liên lạc — mỗi người
  // một việc. Ngoài các mã này, admin vẫn gõ được một chức danh tự do.
  TRUONG_BAN: 'Trưởng ban liên lạc',
  PHO_BAN: 'Phó ban liên lạc',
  THU_KY: 'Thư ký',
  THU_QUY: 'Thủ quỹ',
  LIEN_LAC: 'Người liên lạc',
  THANH_VIEN: 'Thành viên',
};

export function committeeRoleLabel(role?: string | null): string {
  if (!role) return '';
  return COMMITTEE_ROLE_LABELS[role] ?? role;
}

/**
 * Thứ tự hiển thị: trưởng tộc, phó trưởng tộc, rồi ban liên lạc theo thứ bậc
 * (trưởng ban → phó ban → thư ký → thủ quỹ → người liên lạc); chức danh tự do
 * xếp cuối.
 *
 * `committeeRole` lưu MÃ enum chứ không phải câu chữ, nên sắp theo alphabet
 * không ra đúng thứ bậc.
 */
export const COMMITTEE_ROLE_RANK: Record<string, number> = {
  TRUONG_TOC: 0,
  PHO_TRUONG_TOC: 1,
  TRUONG_BAN: 2,
  PHO_BAN: 3,
  THU_KY: 4,
  THU_QUY: 5,
  LIEN_LAC: 6,
};
export const COMMITTEE_ROLE_RANK_DEFAULT = 90;

export function committeeRoleRank(role?: string | null): number {
  return COMMITTEE_ROLE_RANK[role ?? ''] ?? COMMITTEE_ROLE_RANK_DEFAULT;
}

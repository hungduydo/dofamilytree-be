/**
 * Đọc nơi an táng từ tiểu sử gia phả nhập khẩu: "Mộ: Đùng Vành.",
 * "Mộ: Làng Phương Ngạn, Triệu Phong, Quảng Trị. Kỵ: không rõ."
 * Cắt ở dấu chấm kết câu hoặc hết dòng — nhưng KHÔNG cắt ở dấu chấm của chữ viết
 * tắt địa chỉ ("Nghĩa trang phía Nam Tp. Huế").
 *
 * Trả về:
 *  - `{ place }` khi đọc được địa danh;
 *  - `'unknown'` khi ghi "Mộ: không rõ" (có dòng nhưng không có thông tin);
 *  - `null` khi không có dòng "Mộ:" nào.
 */
export function parseGraveNote(text: string | null | undefined): { place: string } | 'unknown' | null {
  // Một "mẩu" là: ký tự không phải chấm/xuống dòng, hoặc chữ viết tắt kèm dấu chấm.
  const match = text?.match(
    /Mộ:\s*((?:(?:\b(?:Tp|TP|TX|Tx|TT|Tt|Q|P|H|X)\.\s*)|[^.\r\n])*)/u,
  );
  if (!match) return null;
  const place = match[1].replace(/\s+/g, ' ').trim().replace(/[,;:]+$/, '');
  if (!place || /^(không rõ|chưa rõ|\?+)$/i.test(place)) return 'unknown';
  return { place };
}

/** Tên hiển thị của một mộ phần gắn với thành viên. */
export const graveNameFor = (memberName: string) => `Mộ ${memberName}`;

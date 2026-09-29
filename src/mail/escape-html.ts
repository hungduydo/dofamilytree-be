/**
 * Escape MỌI giá trị do người dùng nhập trước khi nhúng vào email HTML — tên,
 * tiêu đề ngày giỗ, claim đăng ký. Không escape thì một cái tên chứa
 * `<a href=…>` thành link giả trong hộp thư của cả dòng họ.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

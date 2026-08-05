/**
 * Hằng số + helper cho Media. Cùng cơ chế allowlist như members.service.ts:
 * giá trị từ query string / mimetype CHỈ đi tiếp nếu nằm trong danh sách —
 * không bao giờ nội suy thẳng vào `where`/`orderBy`.
 */

/** Bốn nhóm hiển thị trên UI (tabs Tất cả / Hình ảnh / Video / Audio / Tài liệu). */
export const MEDIA_TYPES = ['image', 'video', 'audio', 'document'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** Allowlist cho `?sortBy=`. `title` sắp theo tên; `views` cho "xem nhiều". */
export const MEDIA_SORT_FIELDS = ['created_at', 'views', 'title'] as const;
export type MediaSortField = (typeof MEDIA_SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

/** Phân loại `type` từ MIME khi upload không truyền `type` tường minh. */
export function classifyMediaType(mimetype?: string): MediaType {
  if (!mimetype) return 'document';
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
}

/** True nếu MIME là ảnh mà sharp nén được (jpeg/png/webp). GIF giữ nguyên. */
export function isCompressibleImage(mimetype?: string): boolean {
  return mimetype === 'image/jpeg' || mimetype === 'image/png' || mimetype === 'image/webp';
}

/**
 * MIME được phép upload qua multipart. Cố ý rộng cho 4 nhóm UI hỗ trợ; file lớn
 * đã bị chặn bởi MAX_UPLOAD_BYTES ở FileInterceptor.
 */
export const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/'] as const;
export const ALLOWED_MIME_EXACT = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/plain',
] as const;

export function isAllowedMime(mimetype?: string): boolean {
  if (!mimetype) return false;
  if (ALLOWED_MIME_PREFIXES.some((p) => mimetype.startsWith(p))) return true;
  return (ALLOWED_MIME_EXACT as readonly string[]).includes(mimetype);
}

/** Trần size cho multipart upload. File lớn hơn nên đi đường client → Blob trực tiếp. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

/** Hạn mức lưu trữ hiển thị ở thẻ "Dung lượng lưu trữ" (mặc định 100 GB). */
export const STORAGE_QUOTA_BYTES =
  Number(process.env.MEDIA_STORAGE_QUOTA_BYTES) || 100 * 1024 ** 3;

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

/**
 * Trần size cho multipart upload (file đi QUA function).
 *
 * CẢNH BÁO: đây KHÔNG phải trần thấp nhất trên đường đi. Trên Vercel, request
 * body bị chặn ở tầng platform TRƯỚC khi tới NestJS — 4.5MB nếu project chưa
 * bật Fluid Compute, 100MB nếu đã bật. Function chỉ thấy request nào lọt qua
 * được tầng đó, nên đặt hằng này cao hơn trần platform là vô nghĩa: client sẽ
 * nhận 413 của Vercel (không phải của ta) và không đọc được message tiếng Việt.
 *
 * File lớn hơn nên đi đường presigned URL (`POST /v2/media/upload-url`) —
 * client PUT thẳng lên R2, không qua function nên không dính trần nào.
 */
export const MAX_UPLOAD_BYTES =
  Number(process.env.MEDIA_MAX_UPLOAD_BYTES) || 50 * 1024 * 1024; // 50 MB

/**
 * Trần cứng của tầng platform, chỉ dùng để CẢNH BÁO lúc bootstrap khi
 * `MAX_UPLOAD_BYTES` được đặt cao hơn — lúc đó client sẽ gặp 413 lạ của Vercel
 * thay vì lỗi có message của ta.
 */
export const VERCEL_BODY_LIMIT_BYTES = {
  withoutFluid: 4.5 * 1024 * 1024,
  withFluid: 100 * 1024 * 1024,
} as const;

/** Số byte → "10 MB" cho message lỗi hiển thị thẳng cho người dùng. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace(/\.0$/, '')} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1).replace(/\.0$/, '')} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Thời hạn presigned PUT URL (giây). Đủ dài cho file lớn trên mạng chậm. */
export const PRESIGN_EXPIRES_SECONDS =
  Number(process.env.MEDIA_PRESIGN_EXPIRES_SECONDS) || 15 * 60; // 15 phút

/** Trần size cho đường presigned — file đi thẳng lên R2 nên rộng hơn nhiều. */
export const MAX_PRESIGNED_BYTES =
  Number(process.env.MEDIA_MAX_PRESIGNED_BYTES) || 2 * 1024 ** 3; // 2 GB

/**
 * Key của file trên storage. Dùng CHUNG cho cả hai luồng upload (multipart qua
 * function và presigned PUT thẳng lên R2) — bước `complete` phải suy lại đúng
 * key mà presigned URL đã ký, nên format này không được phép lệch nhau.
 *
 * Tên file bị rút gọn về `[a-zA-Z0-9._-]` vì key nằm trong URL public: dấu tiếng
 * Việt và khoảng trắng sẽ bị encode khác nhau giữa client PUT và server ghép
 * URL, dẫn tới file "upload xong nhưng 404".
 */
export function storageKeyFor(mediaId: string, filename: string): string {
  const safe = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return `media/${mediaId}/${safe || 'file'}`;
}

/** Hạn mức lưu trữ hiển thị ở thẻ "Dung lượng lưu trữ" (mặc định 100 GB). */
export const STORAGE_QUOTA_BYTES =
  Number(process.env.MEDIA_STORAGE_QUOTA_BYTES) || 100 * 1024 ** 3;

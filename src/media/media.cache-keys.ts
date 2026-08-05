/**
 * Khoá cache cho các endpoint public "nặng đọc, ít đổi" của media (`/stats`,
 * `/albums`). Tách file riêng theo đúng tiền lệ members.cache-keys.ts: nơi khác
 * muốn invalidate không phải import cả MediaModule chỉ vì mấy chuỗi hằng.
 *
 * List phân trang (`GET /media`) KHÔNG cache — cardinality tổ hợp filter quá cao.
 */
export const CACHE_KEY_MEDIA_STATS = 'media:stats';
export const CACHE_KEY_MEDIA_ALBUMS = 'media:albums';

/** Mọi khoá cần xoá sau một lần ghi media/album. */
export const MEDIA_CACHE_KEYS = [
  CACHE_KEY_MEDIA_STATS,
  CACHE_KEY_MEDIA_ALBUMS,
] as const;

/** Stats đổi theo mọi upload/delete/album — TTL ngắn. */
export const MEDIA_CACHE_TTL_STATS = 300;
/** Albums đổi hiếm hơn. */
export const MEDIA_CACHE_TTL_ALBUMS = 900;

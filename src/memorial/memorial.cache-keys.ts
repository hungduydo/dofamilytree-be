/**
 * Khoá cache cho ba endpoint đọc của memorial. Tách file riêng theo đúng tiền
 * lệ tree.cache-keys.ts / members.cache-keys.ts: nơi khác muốn invalidate không
 * phải import cả MemorialModule chỉ vì mấy chuỗi hằng.
 */

export const CACHE_KEY_MEMORIAL_STATS = 'memorial:stats';

/**
 * CHỈ cache TRANG ĐẦU. Trang /ancestor-memorial là consumer duy nhất và luôn
 * gọi page=1 với pageSize cố định (6 tổ tiên, 5 lời tưởng niệm), nên cache trang
 * sâu vừa không ai dùng vừa làm số khoá phình không giới hạn.
 */
export const memorialAncestorsKey = (pageSize: number) => `memorial:ancestors:1:${pageSize}`;
export const memorialTributesKey = (pageSize: number) => `memorial:tributes:1:${pageSize}`;

/**
 * Upstash REST không cho SCAN tiện lợi và SafeCache chỉ có `del(...keys)`, nên
 * invalidation phải liệt kê tường minh. Ba giá trị: 5 và 6 là những gì FE gọi
 * (TRIBUTES_SHOWN / ANCESTORS_SHOWN), 20 là pageSize mặc định của API.
 *
 * Thêm pageSize mới vào đây NGAY khi FE đổi con số, nếu không lần ghi tiếp theo
 * sẽ không xoá được khoá đó và trang hiện số cũ tới hết TTL.
 */
export const MEMORIAL_CACHED_PAGE_SIZES = [5, 6, 20] as const;

/** Mọi khoá cần xoá sau một lần thắp hương / viết / xoá lời tưởng niệm. */
export const MEMORIAL_CACHE_KEYS: string[] = [
  CACHE_KEY_MEMORIAL_STATS,
  ...MEMORIAL_CACHED_PAGE_SIZES.map(memorialAncestorsKey),
  ...MEMORIAL_CACHED_PAGE_SIZES.map(memorialTributesKey),
];

/**
 * TTL ngắn (60s) là CỐ Ý và khớp với thời gian FE giữ cache của chính nó. Con số
 * này chỉ là lưới an toàn — đường đúng là invalidate sau mỗi lần ghi, vì FE
 * refetch NGAY sau khi thắp hương và một response cũ sẽ hiện sai số đếm.
 */
export const MEMORIAL_CACHE_TTL = 60;

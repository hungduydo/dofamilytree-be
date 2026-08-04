/**
 * Khoá cache cho ba endpoint public của members (`/committee`, `/notable`,
 * `/stats`). Tách file riêng theo đúng tiền lệ của tree.cache-keys.ts: nơi khác
 * muốn invalidate không phải import cả MembersModule chỉ vì mấy chuỗi hằng.
 */
export const CACHE_KEY_MEMBERS_COMMITTEE = 'members:committee';
export const CACHE_KEY_MEMBERS_NOTABLE = 'members:notable';
export const CACHE_KEY_MEMBERS_STATS = 'members:stats';

/** Mọi khoá cần xoá sau một lần ghi member/profile. */
export const MEMBERS_CACHE_KEYS = [
  CACHE_KEY_MEMBERS_COMMITTEE,
  CACHE_KEY_MEMBERS_NOTABLE,
  CACHE_KEY_MEMBERS_STATS,
] as const;

/**
 * TTL ngắn hơn tree (3600) là CỐ Ý: repo v1 dùng CHUNG database và ghi thẳng
 * vào members/profiles mà không đi qua invalidation của v2. TTL là lớp bảo vệ
 * duy nhất trước những lần ghi đó (và trước sửa tay trên Supabase console).
 */
export const MEMBERS_CACHE_TTL_LIST = 900; // committee, notable — đổi rất hiếm
export const MEMBERS_CACHE_TTL_STATS = 300; // stats — đổi theo mọi lần create/delete

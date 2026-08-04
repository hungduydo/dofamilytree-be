/**
 * Khoá cache dùng chung giữa `TreeService` (ghi) và `GenerationService` (xoá).
 *
 * Tách ra file riêng thay vì export từ `tree.service.ts` để `GenerationModule`
 * không phải tạo cạnh phụ thuộc sang `TreeModule` chỉ vì hai chuỗi hằng.
 */
export const CACHE_KEY_FULL = 'tree:chart:full';
export const CACHE_KEY_STATS = 'tree:stats';

/** TTL (giây) cho cả hai khoá trên. */
export const CACHE_TTL = 3600;

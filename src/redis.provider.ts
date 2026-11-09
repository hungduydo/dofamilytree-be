import { Provider } from '@nestjs/common';
import { Redis as UpstashRedis } from '@upstash/redis';

/**
 * Client cho dữ liệu BẮT BUỘC phải ghi/đọc được (khác cache) — hiện là auth
 * của một đợt import Google Drive (`mediaDriveTokenKey`). Inject bằng token này
 * thay vì `REDIS_CLIENT`.
 */
export const REDIS_DURABLE_CLIENT = 'REDIS_DURABLE_CLIENT';

function redisCredentials(): { url: string; token: string } {
  // `REDIS_2_KV_REST_API_*` là tên Vercel Marketplace tự inject cho Upstash —
  // đó là nguồn sự thật trên production, nên đọc trước. `UPSTASH_REDIS_REST_*`
  // giữ làm fallback cho môi trường tự cấu hình tay.
  const url = process.env.REDIS_2_KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.REDIS_2_KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Redis credentials missing: set REDIS_2_KV_REST_API_URL + REDIS_2_KV_REST_API_TOKEN ' +
        '(or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)',
    );
  }
  return { url, token };
}

export const redisProvider: Provider = {
  provide: 'REDIS_CLIENT',
  useFactory: () =>
    new UpstashRedis({
      ...redisCredentials(),
      // The cache is an optimization, never a hard dependency. Disable the
      // default retry (5 attempts w/ exponential backoff ≈ 4.3s stall when the
      // instance is unreachable) so a dead/paused Redis fails in ~10ms and the
      // callers' DB fallback (TreeService.safeCache*) serves the request within
      // budget. `signal` (fresh per request) also bounds a slow-but-alive Redis.
      retry: false,
      // 500ms, không phải 300ms: call đầu sau cold start phải trả giá TLS
      // handshake (đo được 183–256ms từ máy dev). Ngưỡng 300ms cũ nằm sát mức
      // đó ⇒ request đầu tiên dễ bị abort và âm thầm rơi về DB đúng lúc cold
      // start đang chậm sẵn. Vẫn thấp hơn nhiều so với chi phí một query DB.
      signal: () => AbortSignal.timeout(500),
    }),
};

/**
 * Cùng instance Redis nhưng KHÔNG dùng ngân sách 500ms của cache: lời gọi này
 * không có đường lui, nên abort sớm chỉ biến một Redis hơi chậm thành lỗi thật
 * (đã gặp: ghi auth import Drive bị abort sau 500ms khi TLS handshake + event
 * loop bận với 10 lời gọi Drive song song).
 *
 * Lưu ý thư viện: abort do `signal` KHÔNG được retry — `retry` chỉ áp cho lỗi
 * mạng. Vì vậy timeout phải đủ rộng cho cả lần thử đầu.
 */
export const durableRedisProvider: Provider = {
  provide: REDIS_DURABLE_CLIENT,
  useFactory: () =>
    new UpstashRedis({
      ...redisCredentials(),
      retry: { retries: 2, backoff: (attempt) => 200 * (attempt + 1) },
      signal: () => AbortSignal.timeout(5000),
    }),
};

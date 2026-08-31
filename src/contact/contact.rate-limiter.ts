import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis as UpstashRedis } from '@upstash/redis';
import { CONTACT_RATE_LIMITS, hashIp } from './contact.constants';

/**
 * Bộ đếm tần suất cho `POST /v2/contact/messages` — endpoint GHI DUY NHẤT
 * trong API này không có guard (api-contact.md §4: người cần viết nhất lại là
 * người chưa có tài khoản). Đây CHÍNH LÀ lớp bảo vệ, không phải role.
 *
 * TÁCH LÀM HAI BƯỚC, và đây là điểm thiết kế quan trọng nhất của file này:
 *
 *   assertWithinLimits() — CHỈ ĐỌC, chạy trong guard trước khi validate.
 *   recordSubmission()   — TĂNG bộ đếm, chạy SAU khi lá thư đã được ghi.
 *
 * Gộp hai bước làm một (INCR ngay trong guard) là cách viết hiển nhiên hơn và
 * ĐÃ TỪNG là cách file này làm — nhưng nó tính cả những request BỊ TỪ CHỐI vào
 * hạn mức. Guard chạy TRƯỚC ValidationPipe trong Nest, nên một cụ ông gõ nhầm
 * số điện thoại ba lần sẽ bị khoá nguyên một giờ và mất luôn đoạn văn vừa viết.
 * Đó đúng là nhóm người mà cái form này sinh ra để phục vụ, và api-contact.md §5
 * đã nói rõ ưu tiên: một rào cản chắn trước người già còn tệ hơn chính cái spam
 * nó chặn.
 *
 * Cái ta muốn giới hạn là SỐ LÁ THƯ ĐƯỢC LƯU, nên chỉ đếm thứ đó. Request hỏng
 * validate không ghi DB, không ghi storage, nên nó rẻ — chặn lũ request rác là
 * việc của tầng platform (Vercel Firewall), không phải của bộ đếm này.
 *
 * VÌ SAO KHÔNG DÙNG @nestjs/throttler: package đó KHÔNG có trong repo, và bản
 * mặc định của nó đếm trong BỘ NHỚ TIẾN TRÌNH. Trên Vercel mỗi request có thể
 * rơi vào một instance khác nhau nên bộ đếm in-memory gần như vô dụng — thêm
 * dependency chỉ để lấy thứ không chạy được thì thà đếm thẳng trên Upstash,
 * vốn đã là hạ tầng chia sẻ sẵn có của repo.
 *
 * Thuật toán: cửa sổ CỐ ĐỊNH (INCR + EXPIRE). Cửa sổ trượt chính xác hơn nhưng
 * cần sorted set và nhiều round-trip hơn; với ngưỡng 3/giờ thì sai số ở mép cửa
 * sổ là hoàn toàn chấp nhận được.
 */
@Injectable()
export class ContactRateLimiter {
  private readonly logger = new Logger(ContactRateLimiter.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: UpstashRedis) {}

  /**
   * Ném 429 nếu IP này đã dùng hết hạn mức. KHÔNG tăng bộ đếm — xem chú thích
   * đầu file.
   */
  async assertWithinLimits(ip: string | null): Promise<void> {
    if (!ip) return;

    for (const limit of CONTACT_RATE_LIMITS) {
      const key = this.keyFor(ip, limit.windowSeconds);
      let used: number;

      try {
        used = Number((await this.redis.get<string | number>(key)) ?? 0);
      } catch (err) {
        // Redis chết ⇒ CHO QUA, giống SafeCache. Đánh đổi CÓ Ý THỨC: thà nhận
        // spam trong lúc Upstash sập còn hơn chặn cả dòng họ khỏi form liên hệ.
        this.logger.warn(`Redis rate limit lỗi, cho qua: ${(err as Error).message}`);
        return;
      }

      if (used >= limit.max) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            message:
              `Bạn đã gửi quá ${limit.max} tin nhắn trong một ${limit.label}. ` +
              `Ban liên lạc đã nhận được thư của bạn, xin vui lòng chờ trước khi gửi thêm.`,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  /**
   * Tính MỘT lá thư đã lưu vào hạn mức. Gọi SAU khi ghi thành công.
   *
   * Best-effort: bộ đếm hỏng KHÔNG được làm hỏng một lá thư đã nằm trong DB —
   * người gửi sẽ thấy lỗi và gửi lại, thành ra hai bản sao trong hộp thư.
   */
  async recordSubmission(ip: string | null): Promise<void> {
    if (!ip) return;

    for (const limit of CONTACT_RATE_LIMITS) {
      const key = this.keyFor(ip, limit.windowSeconds);
      try {
        const count = await this.redis.incr(key);
        // EXPIRE chỉ ở lần đầu: đặt lại mỗi lần INCR sẽ biến cửa sổ cố định
        // thành "cấm cho tới khi im lặng đủ lâu" — người gửi bị khoá vĩnh viễn
        // chừng nào còn thử lại.
        if (count === 1) await this.redis.expire(key, limit.windowSeconds);
      } catch (err) {
        this.logger.warn(`Không ghi được bộ đếm tần suất (non-fatal): ${(err as Error).message}`);
      }
    }
  }

  /**
   * Băm IP để KHOÁ REDIS cũng không chứa địa chỉ thô: khoá nằm trong log, trong
   * trình duyệt dữ liệu của Upstash, trong ảnh chụp bộ nhớ. Cùng lý do như cột
   * sender_ip_hash. Thiếu muối thì dùng chính IP (khoá Redis là dữ liệu tạm,
   * TTL tối đa 1 ngày) — nhưng KHÔNG bao giờ lưu nó xuống DB.
   */
  private keyFor(ip: string, windowSeconds: number): string {
    const secret = process.env.CONTACT_IP_HASH_SECRET;
    const bucket = secret ? hashIp(ip, secret).slice(0, 32) : ip;
    return `contact:rate:${windowSeconds}:${bucket}`;
  }
}

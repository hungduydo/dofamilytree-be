import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ContactRateLimiter } from './contact.rate-limiter';

/**
 * Chặn `POST /v2/contact/messages` khi IP đã dùng hết hạn mức.
 *
 * Guard này CHỈ ĐỌC bộ đếm. Việc TĂNG bộ đếm nằm ở ContactService, sau khi lá
 * thư đã được ghi thành công — guard chạy trước ValidationPipe, nên đếm ở đây
 * là tính cả những request bị từ chối vì gõ sai vào hạn mức. Xem chú thích đầu
 * ContactRateLimiter để biết vì sao điều đó là hỏng chứ không phải chặt chẽ.
 */
@Injectable()
export class ContactThrottleGuard implements CanActivate {
  constructor(private readonly rateLimiter: ContactRateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    await this.rateLimiter.assertWithinLimits(clientIpOf(req));
    return true;
  }
}

/**
 * IP thật của người gửi.
 *
 * `x-forwarded-for` đứng TRƯỚC vì trên Vercel `req.ip` là IP của proxy nội bộ —
 * dùng nó thì cả thế giới chung một bộ đếm và người thứ tư gửi thư trong giờ đó
 * bị chặn nhầm. Lấy phần tử ĐẦU TIÊN: đó là client, các phần tử sau là chuỗi proxy.
 *
 * Header này người gọi GIẢ ĐƯỢC, nên rate limit này chặn được spam ngẫu nhiên
 * chứ không chặn được kẻ tấn công có chủ đích. Muốn chặt hơn phải dùng
 * `x-vercel-forwarded-for` (Vercel tự ký) hoặc Vercel Firewall — ghi ở đây để
 * người sau biết ranh giới, đừng nhầm lớp này là chống lạm dụng tuyệt đối.
 *
 * Không xác định được IP ⇒ trả null, và ContactRateLimiter cho qua. Fail-open
 * là lựa chọn có cân nhắc: chặn hết khi không đọc được IP sẽ khoá toàn bộ form
 * với mọi người sau một thay đổi hạ tầng, và một form liên hệ chết là hỏng nặng
 * hơn là nhận thêm spam.
 */
export function clientIpOf(req: any): string | null {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = typeof raw === 'string' ? raw.split(',')[0]?.trim() : undefined;
  return first || req?.ip || req?.socket?.remoteAddress || null;
}

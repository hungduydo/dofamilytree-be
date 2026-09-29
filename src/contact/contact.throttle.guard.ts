import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ContactRateLimiter } from './contact.rate-limiter';
import { clientIpOf } from '../utils/client-ip';

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

// Dời sang utils để AuthThrottleGuard dùng chung; re-export giữ import cũ chạy.
export { clientIpOf } from '../utils/client-ip';

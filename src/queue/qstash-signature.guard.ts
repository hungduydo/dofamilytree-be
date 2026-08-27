import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Receiver } from '@upstash/qstash';
import { queueCallbackUrl } from './queue.constants';

/**
 * Xác thực chữ ký QStash cho POST /v2/queue/callback/:task.
 *
 * Trước đây route này KHÔNG có guard lẫn verify — bất kỳ ai biết URL đều kích
 * được job nền (upload avatar, tính lại thế hệ, xử lý ảnh) với payload tự chọn.
 *
 * CẦN `rawBody`: chữ ký ký trên body THÔ, nên body đã qua JSON.parse rồi
 * stringify lại có thể lệch từng byte. main.ts/vercel.ts bật `rawBody: true`.
 */
@Injectable()
export class QStashSignatureGuard implements CanActivate {
  private readonly logger = new Logger(QStashSignatureGuard.name);

  private readonly receiver =
    process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
      ? new Receiver({
          currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
          nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
        })
      : null;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    if (!this.receiver) {
      // Thiếu key trên production là lỗi cấu hình, KHÔNG được im lặng cho qua —
      // đó chính là trạng thái không bảo vệ mà ta đang sửa.
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('QStash signing keys chưa được cấu hình');
      }
      this.logger.warn('QSTASH_*_SIGNING_KEY chưa cấu hình — BỎ QUA verify (chỉ dev/test)');
      return true;
    }

    const signature = req.headers?.['upstash-signature'];
    const body = req.rawBody?.toString('utf8');

    // rawBody undefined nghĩa là bootstrap quên `rawBody: true`. Fail closed:
    // thà mọi job hỏng ồn ào còn hơn chấp nhận callback không kiểm chứng.
    if (!signature || body === undefined) {
      throw new UnauthorizedException('Thiếu chữ ký QStash hoặc raw body');
    }

    const isValid = await this.receiver
      .verify({ signature, body, url: queueCallbackUrl(req.params.task) })
      .catch(() => false);

    if (!isValid) throw new UnauthorizedException('Chữ ký QStash không hợp lệ');
    return true;
  }
}

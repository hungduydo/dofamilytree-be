import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { errorAttributes, logEvent } from '../observability/log-event';

export type MailMessage = {
  to: string[];
  subject: string;
  text: string;
  html: string;
  /** Header thêm, vd. List-Unsubscribe cho email định kỳ (Gmail/Yahoo bắt buộc). */
  headers?: Record<string, string>;
};

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Gửi email giao dịch qua Resend.
 *
 * Gọi thẳng HTTP API bằng `fetch` thay vì kéo SDK: chỉ cần đúng một request,
 * và backend chạy Node ≥ 22 nên `fetch` có sẵn.
 *
 * KHÔNG nuốt lỗi: `send` ném khi Resend trả lỗi, để job QStash gọi nó thất bại
 * và được QStash retry. Chỗ gọi quyết định có chịu được lỗi hay không.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  /** Báo một lần lúc khởi động — không phải đợi tới job gửi thư đầu tiên mới biết. */
  onModuleInit(): void {
    const missing = ['RESEND_API_KEY', 'MAIL_FROM'].filter((k) => !process.env[k]);
    if (missing.length) {
      logEvent('config.missing', 'error', 'Required configuration missing', {
        'config.component': 'mail',
        'config.keys': missing.join(','),
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Mail chưa cấu hình: thiếu RESEND_API_KEY hoặc MAIL_FROM');
    }

    let res: Response;
    try {
      res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          ...(message.headers && { headers: message.headers }),
        }),
      });
    } catch (err) {
      this.logSendFailed(message, err);
      throw err;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`Resend trả ${res.status}: ${body.slice(0, 300)}`);
      this.logSendFailed(message, err, res.status);
      throw err;
    }

    this.logger.log(`Đã gửi "${message.subject}" tới ${message.to.length} người nhận`);
  }

  /** Không ghi subject / người nhận (có thể chứa tên, email) — chỉ số lượng. */
  private logSendFailed(message: MailMessage, err: unknown, status?: number): void {
    logEvent('mail.send_failed', 'error', 'Mail send failed', {
      'mail.provider': 'resend',
      'mail.recipients': message.to.length,
      'http.response.status_code': status,
      ...errorAttributes(err),
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';

export type MailMessage = {
  to: string[];
  subject: string;
  text: string;
  html: string;
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
export class MailService {
  private readonly logger = new Logger(MailService.name);

  isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Mail chưa cấu hình: thiếu RESEND_API_KEY hoặc MAIL_FROM');
    }

    const res = await fetch(RESEND_ENDPOINT, {
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
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend trả ${res.status}: ${body.slice(0, 300)}`);
    }

    this.logger.log(`Đã gửi "${message.subject}" tới ${message.to.length} người nhận`);
  }
}

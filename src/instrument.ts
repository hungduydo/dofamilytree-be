import * as Sentry from '@sentry/nestjs';

/**
 * Error tracking (Sentry). PHẢI được import ĐẦU TIÊN ở main.ts / vercel.ts —
 * SDK vá các module (http, express, nest) lúc chúng được require.
 *
 * Trước đây lỗi 500 trên production chỉ nằm trong log Vercel (vercel.ts chỉ log
 * error/warn), không ai được báo — người dùng gặp lỗi rồi thôi.
 *
 * Thiếu SENTRY_DSN ⇒ không init, mọi thứ là no-op (local, test, preview).
 * Chỉ báo lỗi BẤT NGỜ: SentryGlobalFilter bỏ qua HttpException (400/401/404…).
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    // Chỉ lấy lỗi, không trace hiệu năng — gói free có hạn mức, và cái cần
    // trước tiên là biết khi nào có 500.
    tracesSampleRate: 0,
    // SDK v11 mặc định thu MỌI THỨ (body, cookie, header, biến cục bộ trong
    // stack frame, tham số SQL). Ở đây body là mật khẩu đăng nhập, PII profile,
    // thư liên hệ — tắt tường minh từng mục; scrubEvent là lớp chặn thứ hai.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      databaseQueryData: false,
      queues: false,
      genAI: { inputs: false, outputs: false },
    },
    beforeSend: scrubEvent,
  });
}

/**
 * Gỡ dữ liệu nhạy cảm trước khi rời server: body (mật khẩu đăng nhập, PII
 * profile, nội dung thư liên hệ), cookie, header xác thực, và query string
 * (link tắt nhắc ngày giỗ mang token trong `?token=`).
 */
export function scrubEvent<T extends { request?: Record<string, any> }>(event: T): T {
  const req = event.request;
  if (req) {
    delete req.data;
    delete req.cookies;
    delete req.query_string;
    if (req.url) req.url = String(req.url).split('?')[0];
    if (req.headers) {
      for (const h of Object.keys(req.headers)) {
        if (/^(authorization|cookie|x-forwarded-for|x-real-ip|upstash-signature)$/i.test(h)) delete req.headers[h];
      }
    }
  }
  return event;
}

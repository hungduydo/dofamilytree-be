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
 *
 * Tracing (Performance): lấy mẫu theo SENTRY_TRACES_SAMPLE_RATE (0..1, mặc định
 * 0.2 — gói free có hạn mức span). Đặt 0 để tắt hẳn trace, chỉ giữ báo lỗi.
 *
 * Logs (Sentry Logs): SDK v11 luôn bật — mọi `Sentry.logger.*` đều được gửi,
 * tự gắn trace_id của request đang chạy. Ngưỡng theo SENTRY_LOG_LEVEL
 * (trace|debug|info|warn|error|fatal|off, mặc định info); log dưới ngưỡng bị
 * bỏ trong `scrubLog`. Logger của Nest KHÔNG được nối sang Sentry: nhiều dòng
 * cũ nội suy email / URL có token vào message — chỉ gửi những log viết riêng
 * cho Sentry, với thuộc tính có cấu trúc (xem docs/SENTRY_LOGS.md).
 */
const dsn = process.env.SENTRY_DSN;

export function parseSampleRate(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.2),
    // Không gắn header sentry-trace/baggage vào request ra bên thứ ba (Upstash,
    // Supabase, Resend, R2): baggage mang release/environment, và họ không
    // gửi trace về Sentry của mình nên chẳng được gì. Trace từ frontend gửi
    // vào vẫn được nối tiếp bình thường.
    tracePropagationTargets: [],
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
    beforeSendTransaction: scrubEvent,
    beforeSendSpan: scrubSpan,
    beforeSendLog: scrubLog,
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

/** Thuộc tính span có thể mang query string (token tắt nhắc, chữ ký presign…). */
const SPAN_URL_ATTRS = ['url.full', 'http.url', 'http.target', 'url.original', 'http.request.url'];
const SPAN_DROP_ATTRS = ['url.query', 'http.query'];

const stripQuery = (v: unknown) => (typeof v === 'string' && v.includes('?') ? v.split('?')[0] : v);

/**
 * Lớp chặn cho từng span gửi lên Sentry (SDK v11 stream span riêng lẻ, không
 * đi qua beforeSend/beforeSendTransaction). Giá trị thuộc tính có thể là
 * nguyên thuỷ hoặc dạng `{ value, unit }`.
 */
export function scrubSpan<T extends { name: string; attributes?: Record<string, any> }>(span: T): T {
  span.name = stripQuery(span.name) as string;
  const attrs = span.attributes;
  if (attrs) {
    for (const key of SPAN_DROP_ATTRS) delete attrs[key];
    for (const key of SPAN_URL_ATTRS) {
      const a = attrs[key];
      if (a && typeof a === 'object' && 'value' in a) a.value = stripQuery(a.value);
      else if (a !== undefined) attrs[key] = stripQuery(a);
    }
  }
  return span;
}

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Chỉ số ngưỡng; `off` ⇒ vượt mọi mức (bỏ hết). Giá trị lạ ⇒ fallback. */
export function parseLogLevel(raw: string | undefined, fallback: LogLevel = 'info'): number {
  const v = raw?.trim().toLowerCase();
  if (v === 'off') return LOG_LEVELS.length;
  const i = LOG_LEVELS.indexOf(v as LogLevel);
  return i >= 0 ? i : LOG_LEVELS.indexOf(fallback);
}

const minLogLevel = parseLogLevel(process.env.SENTRY_LOG_LEVEL);

/**
 * Khoá thuộc tính log không bao giờ được rời server. So theo từng đoạn tên
 * (tách bởi `.`/`_`) để `user.email`, `reset_token`, `user.ip_address` dính,
 * còn `recipients`, `description` thì không.
 */
const SENSITIVE_LOG_ATTR = /(^|[._])(email|password|passwd|secret|token|authorization|cookie|ip|phone)($|[._])/i;
const SENSITIVE_LOG_ATTR_EXACT = new Set(['client.address', 'http.request.header.authorization']);

/**
 * Lớp chặn cuối cho Sentry Logs: bỏ log dưới ngưỡng SENTRY_LOG_LEVEL, che
 * thuộc tính nhạy cảm, cắt query string khỏi giá trị URL và che email trong chuỗi.
 * Message KHÔNG được scrub — đừng nội suy PII vào message, hãy dùng
 * `Sentry.logger.fmt` với tham số không nhạy cảm.
 */
export function scrubLog<T extends { level: string; attributes?: Record<string, unknown> }>(
  log: T,
  minLevel = minLogLevel,
): T | null {
  const idx = LOG_LEVELS.indexOf(log.level as LogLevel);
  if (idx >= 0 && idx < minLevel) return null;
  const attrs = log.attributes;
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      if (SENSITIVE_LOG_ATTR.test(key) || SENSITIVE_LOG_ATTR_EXACT.has(key)) {
        attrs[key] = '[Filtered]';
        continue;
      }
      const a = attrs[key] as any;
      if (a && typeof a === 'object' && 'value' in a) a.value = scrubLogValue(a.value);
      else attrs[key] = scrubLogValue(a);
    }
  }
  return log;
}

const EMAIL_IN_TEXT = /[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi;

/**
 * Giá trị chuỗi: cắt query string của URL (token tắt nhắc, chữ ký presign) và
 * che email lọt vào (vd. `error.message` của Resend nhắc lại địa chỉ người nhận).
 */
function scrubLogValue(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const noQuery = v.includes('?') && /^(https?:\/\/|\/)/.test(v) ? v.split('?')[0] : v;
  return noQuery.replace(EMAIL_IN_TEXT, '[email]');
}

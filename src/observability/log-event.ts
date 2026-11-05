import * as Sentry from '@sentry/nestjs';

/**
 * Danh mục `event.name` — nguồn sự thật cho lọc / alert trong Sentry Logs.
 * Thêm sự kiện mới: thêm vào đây VÀ vào docs/SENTRY_LOG_EVENTS.md.
 */
export type LogEventName =
  // auth / admin
  | 'auth.login.failed'
  | 'auth.rate_limited'
  | 'auth.forbidden'
  | 'admin.user.roles_changed'
  | 'admin.user.activation_changed'
  // queue / jobs
  | 'queue.signature.invalid'
  | 'queue.task.unknown'
  | 'queue.publish.failed'
  | 'reminder.run.completed'
  | 'reminder.mail_not_configured'
  | 'reminder.recipient_skipped'
  | 'reminder.send_failed'
  // media / storage
  | 'media.processed'
  | 'media.processing_failed'
  | 'storage.delete.failed'
  | 'storage.provider.fallback'
  // contact / mail
  | 'contact.rate_limited'
  | 'contact.attachment.upload_failed'
  | 'mail.send_failed'
  // infra
  | 'cache.degraded'
  | 'config.missing';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogAttributes = Record<string, string | number | boolean | undefined>;

/** Message: chuỗi cố định, hoặc `Sentry.logger.fmt\`...\`` khi cần chèn tham số. */
type LogMessage = Parameters<typeof Sentry.logger.info>[0];

/**
 * Ghi một sự kiện có tên vào Sentry Logs. Thuộc tính `undefined` bị bỏ.
 * No-op khi Sentry tắt (thiếu SENTRY_DSN). Không bao giờ ném.
 */
export function logEvent(name: LogEventName, level: LogLevel, message: LogMessage, attributes: LogAttributes = {}): void {
  const attrs: Record<string, string | number | boolean> = { 'event.name': name };
  for (const [k, v] of Object.entries(attributes)) if (v !== undefined) attrs[k] = v;
  try {
    Sentry.logger[level](message, attrs);
  } catch {
    // Log hỏng không được làm hỏng nghiệp vụ.
  }
}

export const THROTTLE_WINDOW_MS = 60_000;
const lastEmitted = new Map<string, { at: number; suppressed: number }>();

/**
 * Như `logEvent` nhưng tối đa MỘT log / `THROTTLE_WINDOW_MS` cho mỗi
 * (event, throttleKey) trên instance này — cho sự kiện lặp theo từng request
 * khi hạ tầng hỏng (Redis sập ⇒ mọi request đều degrade). Log kế tiếp mang
 * `throttle.suppressed` = số lần đã nuốt trong cửa sổ trước.
 */
export function logEventThrottled(
  name: LogEventName,
  level: LogLevel,
  message: LogMessage,
  attributes: LogAttributes = {},
  throttleKey = '',
  now = Date.now(),
): boolean {
  const key = `${name}|${throttleKey}`;
  const prev = lastEmitted.get(key);
  if (prev && now - prev.at < THROTTLE_WINDOW_MS) {
    prev.suppressed++;
    return false;
  }
  lastEmitted.set(key, { at: now, suppressed: 0 });
  logEvent(name, level, message, { ...attributes, 'throttle.suppressed': prev?.suppressed ?? 0 });
  return true;
}

/** Chỉ cho test. */
export function _resetLogThrottle(): void {
  lastEmitted.clear();
}

/** `error.type` + `error.message` chuẩn cho mọi sự kiện lỗi (message qua scrubLog). */
export function errorAttributes(err: unknown): LogAttributes {
  const e = err instanceof Error ? err : new Error(String(err));
  return { 'error.type': e.name, 'error.message': e.message };
}

/**
 * Gắn người gọi vào isolation scope của request — mọi log sau đó trong request
 * tự có `user.id` / `user.roles` mà không phải truyền tay. Gọi khi xác thực xong.
 */
export function setRequestUser(userId: string, roles: readonly string[] | null | undefined): void {
  try {
    Sentry.getIsolationScope().setAttributes({
      'user.id': userId,
      ...(roles?.length ? { 'user.roles': roles.join(',') } : {}),
    });
  } catch {
    // ignore
  }
}

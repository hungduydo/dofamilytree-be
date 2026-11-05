import * as Sentry from '@sentry/nestjs';

/**
 * Sentry Logs nằm trong buffer tới khi đủ lô hoặc hết hẹn giờ — trên Vercel,
 * function bị đóng băng ngay khi request VÀ mọi việc `waitUntil` xong, nên log
 * còn trong buffer sẽ mất. Đánh dấu khi có log để nơi kết thúc công việc
 * (response xong, hoặc việc nền xong) flush ngay.
 */
let pending = false;
let hooked = false;

function hook(): void {
  if (hooked) return;
  const client = Sentry.getClient();
  if (!client) return;
  client.on('afterCaptureLog', () => {
    pending = true;
  });
  hooked = true;
}

hook();

/** Có log chờ gửi không — đồng thời xoá cờ (người gọi sẽ flush). */
export function takePendingSentryLogs(): boolean {
  hook();
  const p = pending;
  pending = false;
  return p;
}

/** Flush nếu có log chờ; không thì no-op. Không bao giờ reject. */
export function flushPendingSentryLogs(timeoutMs = 2000): Promise<unknown> {
  if (!takePendingSentryLogs() || !Sentry.isEnabled()) return Promise.resolve();
  return Sentry.flush(timeoutMs).catch(() => {});
}

import { waitUntil } from '@vercel/functions';
import { flushPendingSentryLogs } from './sentry-log-flush';

/**
 * Runs `work` in the background WITHOUT blocking the current HTTP response.
 *
 * On Vercel, `waitUntil` keeps the serverless function alive until the promise
 * settles, so background work (QStash enqueue, notifications) is not dropped
 * when the function suspends after sending the response. Off Vercel (local dev,
 * tests) `waitUntil` is a no-op but the promise still runs detached.
 *
 * Errors are always swallowed — background work must never fail the request.
 *
 * Việc nền chạy SAU khi response đã xong, nên flush ở `res.on('finish')` không
 * bắt được Sentry Logs nó ghi — flush lại ngay khi việc nền kết thúc, trước
 * khi `waitUntil` thả function cho Vercel đóng băng.
 */
export function runInBackground(work: Promise<unknown>): void {
  const safe = Promise.resolve(work)
    .catch(() => {})
    .then(() => flushPendingSentryLogs());
  try {
    waitUntil(safe);
  } catch {
    // No request context (older runtime / non-Vercel) — promise still runs.
    void safe;
  }
}

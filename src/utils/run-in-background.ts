import { waitUntil } from '@vercel/functions';

/**
 * Runs `work` in the background WITHOUT blocking the current HTTP response.
 *
 * On Vercel, `waitUntil` keeps the serverless function alive until the promise
 * settles, so background work (QStash enqueue, notifications) is not dropped
 * when the function suspends after sending the response. Off Vercel (local dev,
 * tests) `waitUntil` is a no-op but the promise still runs detached.
 *
 * Errors are always swallowed — background work must never fail the request.
 */
export function runInBackground(work: Promise<unknown>): void {
  const safe = Promise.resolve(work).catch(() => {});
  try {
    waitUntil(safe);
  } catch {
    // No request context (older runtime / non-Vercel) — promise still runs.
    void safe;
  }
}

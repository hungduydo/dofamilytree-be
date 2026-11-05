const listeners: Record<string, Array<() => void>> = {};
const flush = jest.fn().mockResolvedValue(true);
const waitUntil = jest.fn();

jest.mock('@sentry/nestjs', () => ({
  getClient: () => ({ on: (ev: string, cb: () => void) => (listeners[ev] ??= []).push(cb) }),
  isEnabled: () => true,
  flush: (...a: unknown[]) => flush(...a),
}));
jest.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => waitUntil(p) }));

import { runInBackground } from '../../src/utils/run-in-background';
import { takePendingSentryLogs } from '../../src/utils/sentry-log-flush';

const captureLog = () => listeners.afterCaptureLog.forEach((cb) => cb());
const keptAlive = () => waitUntil.mock.calls[waitUntil.mock.calls.length - 1][0] as Promise<unknown>;

describe('runInBackground — Sentry Logs ghi trong việc nền không bị mất', () => {
  beforeEach(() => {
    flush.mockClear();
    waitUntil.mockClear();
    takePendingSentryLogs();
  });

  it('flush SAU khi việc nền xong nếu nó ghi log (response đã xong từ trước)', async () => {
    runInBackground(Promise.resolve().then(captureLog));
    await keptAlive();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('flush cả khi việc nền ném lỗi, và promise giữ function không bao giờ reject', async () => {
    runInBackground(
      Promise.resolve().then(() => {
        captureLog();
        throw new Error('boom');
      }),
    );
    await expect(keptAlive()).resolves.not.toThrow();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('không flush khi không có log chờ', async () => {
    runInBackground(Promise.resolve());
    await keptAlive();
    expect(flush).not.toHaveBeenCalled();
  });

  it('takePendingSentryLogs xoá cờ — không flush lặp', () => {
    captureLog();
    expect(takePendingSentryLogs()).toBe(true);
    expect(takePendingSentryLogs()).toBe(false);
  });
});

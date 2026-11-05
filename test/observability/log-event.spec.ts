const calls: Array<{ level: string; message: unknown; attrs: Record<string, unknown> }> = [];
const setAttributes = jest.fn();

jest.mock('@sentry/nestjs', () => {
  const level = (l: string) => (message: unknown, attrs: Record<string, unknown>) => calls.push({ level: l, message, attrs });
  return {
    logger: { info: level('info'), warn: level('warn'), error: level('error') },
    getIsolationScope: () => ({ setAttributes }),
  };
});

import { Logger } from '@nestjs/common';
import {
  THROTTLE_WINDOW_MS,
  _resetLogThrottle,
  errorAttributes,
  logEvent,
  logEventThrottled,
  setRequestUser,
} from '../../src/observability/log-event';
import { SafeCache } from '../../src/utils/safe-cache';

beforeEach(() => {
  calls.length = 0;
  setAttributes.mockClear();
  _resetLogThrottle();
});

describe('logEvent', () => {
  it('gắn event.name, bỏ thuộc tính undefined, giữ đúng mức', () => {
    logEvent('auth.login.failed', 'warn', 'Login failed', { 'auth.reason': 'deactivated', 'user.id': undefined });
    expect(calls).toEqual([
      { level: 'warn', message: 'Login failed', attrs: { 'event.name': 'auth.login.failed', 'auth.reason': 'deactivated' } },
    ]);
  });

  it('errorAttributes chuẩn hoá cả giá trị không phải Error', () => {
    expect(errorAttributes(new TypeError('x'))).toEqual({ 'error.type': 'TypeError', 'error.message': 'x' });
    expect(errorAttributes('boom')).toEqual({ 'error.type': 'Error', 'error.message': 'boom' });
  });
});

describe('logEventThrottled', () => {
  it('một log / cửa sổ / khoá; log kế tiếp mang số lần đã nuốt', () => {
    const t0 = 1_000_000;
    expect(logEventThrottled('cache.degraded', 'warn', 'm', {}, 'a', t0)).toBe(true);
    expect(logEventThrottled('cache.degraded', 'warn', 'm', {}, 'a', t0 + 10)).toBe(false);
    expect(logEventThrottled('cache.degraded', 'warn', 'm', {}, 'a', t0 + 20)).toBe(false);
    // Khoá khác không bị ảnh hưởng.
    expect(logEventThrottled('cache.degraded', 'warn', 'm', {}, 'b', t0 + 30)).toBe(true);
    expect(logEventThrottled('cache.degraded', 'warn', 'm', {}, 'a', t0 + THROTTLE_WINDOW_MS)).toBe(true);

    expect(calls.map((c) => c.attrs['throttle.suppressed'])).toEqual([0, 0, 2]);
  });
});

describe('setRequestUser', () => {
  it('đặt user.id và user.roles lên isolation scope', () => {
    setRequestUser('u-1', ['admin', 'member']);
    expect(setAttributes).toHaveBeenCalledWith({ 'user.id': 'u-1', 'user.roles': 'admin,member' });
  });

  it('bỏ user.roles khi không có role', () => {
    setRequestUser('u-2', null);
    expect(setAttributes).toHaveBeenCalledWith({ 'user.id': 'u-2' });
  });
});

describe('SafeCache — Redis hỏng thành cache.degraded (throttled), không ném', () => {
  it('lấy component từ context của logger, chỉ log một lần cho lỗi lặp lại', async () => {
    const redis = { get: jest.fn().mockRejectedValue(new Error('ECONNRESET')) } as any;
    const logger = new Logger('TreeService');
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const cache = new SafeCache(redis, logger, 60);

    await expect(cache.get('k1')).resolves.toBeNull();
    await expect(cache.get('k2')).resolves.toBeNull();

    expect(calls).toHaveLength(1);
    expect(calls[0].attrs).toMatchObject({
      'event.name': 'cache.degraded',
      'cache.component': 'TreeService',
      'cache.operation': 'get',
      'error.message': 'ECONNRESET',
      'throttle.suppressed': 0,
    });
  });
});

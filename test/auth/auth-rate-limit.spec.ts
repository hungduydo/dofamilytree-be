import {
  BadRequestException,
  ConflictException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import {
  AUTH_RATE_LIMITS,
  AuthRateLimiter,
  AuthThrottleGuard,
  AuthThrottleInterceptor,
} from '../../src/auth/auth-rate-limit';
import { AuthController } from '../../src/auth/auth.controller';

function build() {
  // Bộ đếm trong bộ nhớ đóng vai Upstash (cùng mẫu contact.throttle.spec.ts).
  const counters = new Map<string, number>();
  const redis = {
    get: jest.fn(async (key: string) => counters.get(key) ?? null),
    incr: jest.fn(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    expire: jest.fn().mockResolvedValue(1),
  } as any;
  const limiter = new AuthRateLimiter(redis);
  const reflector = new Reflector();
  return {
    redis,
    counters,
    limiter,
    guard: new AuthThrottleGuard(reflector, limiter),
    interceptor: new AuthThrottleInterceptor(reflector, limiter),
  };
}

const ctxFor = (handler: Function, req: any) =>
  ({ getHandler: () => handler, switchToHttp: () => ({ getRequest: () => req }) }) as any;

const reqFrom = (ip: string, email?: string) => ({ headers: { 'x-forwarded-for': ip }, body: email ? { email } : {} });

/** Chạy một request qua guard → interceptor → handler giả. */
async function attempt(
  t: ReturnType<typeof build>,
  handler: Function,
  req: any,
  outcome: 'ok' | Error,
) {
  const ctx = ctxFor(handler, req);
  await t.guard.canActivate(ctx);
  const next = { handle: () => (outcome === 'ok' ? of('ok') : throwError(() => outcome)) };
  return lastValueFrom(t.interceptor.intercept(ctx, next));
}

const proto = AuthController.prototype;

describe('Auth rate limit', () => {
  it('login: đăng nhập ĐÚNG không tốn hạn mức', async () => {
    const t = build();
    for (let i = 0; i < 50; i++) await attempt(t, proto.login, reqFrom('1.1.1.1', 'a@x.vn'), 'ok');
    expect(t.redis.incr).not.toHaveBeenCalled();
  });

  it('login: sai mật khẩu 10 lần cho một email ⇒ lần thứ 11 bị 429, kể cả đổi IP', async () => {
    const t = build();
    const max = AUTH_RATE_LIMITS.login.rules[0].max;
    for (let i = 0; i < max; i++) {
      await expect(
        attempt(t, proto.login, reqFrom(`1.1.1.${i}`, 'A@x.vn'), new UnauthorizedException()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    // Email so khớp không phân biệt hoa thường.
    await expect(attempt(t, proto.login, reqFrom('9.9.9.9', 'a@x.vn'), 'ok')).rejects.toMatchObject({
      status: 429,
    });
    // Email khác vẫn vào được.
    await expect(attempt(t, proto.login, reqFrom('9.9.9.9', 'b@x.vn'), 'ok')).resolves.toBe('ok');
  });

  it('login: lỗi validation (400) KHÔNG bị tính — gõ sai định dạng không tự khoá mình', async () => {
    const t = build();
    for (let i = 0; i < 40; i++) {
      await expect(
        attempt(t, proto.login, reqFrom('1.1.1.1', 'a@x.vn'), new BadRequestException()),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(t.redis.incr).not.toHaveBeenCalled();
  });

  it('forgot-password: tối đa 3 email / giờ / hộp thư', async () => {
    const t = build();
    for (let i = 0; i < 3; i++) await attempt(t, proto.forgotPassword, reqFrom(`2.2.2.${i}`, 'a@x.vn'), 'ok');
    const err: any = await attempt(t, proto.forgotPassword, reqFrom('2.2.2.9', 'a@x.vn'), 'ok').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
    expect(err.getResponse().message).toMatch(/Spam/);
  });

  it('register: 409 "email đã tồn tại" CŨNG bị tính — chặn dò email', async () => {
    const t = build();
    const max = AUTH_RATE_LIMITS.register.rules[0].max;
    for (let i = 0; i < max; i++) {
      await expect(
        attempt(t, proto.register, reqFrom('3.3.3.3'), new ConflictException()),
      ).rejects.toBeInstanceOf(ConflictException);
    }
    await expect(attempt(t, proto.register, reqFrom('3.3.3.3'), 'ok')).rejects.toMatchObject({ status: 429 });
    await expect(attempt(t, proto.register, reqFrom('3.3.3.4'), 'ok')).resolves.toBe('ok');
  });

  it('reset-password: token sai bị tính theo IP', async () => {
    const t = build();
    for (let i = 0; i < 10; i++) {
      await attempt(t, proto.resetPassword, reqFrom('4.4.4.4'), new UnauthorizedException()).catch(() => {});
    }
    await expect(attempt(t, proto.resetPassword, reqFrom('4.4.4.4'), 'ok')).rejects.toMatchObject({ status: 429 });
  });

  it('Redis sập ⇒ CHO QUA, không khoá cả dòng họ ngoài cửa', async () => {
    const t = build();
    t.redis.get.mockRejectedValue(new Error('down'));
    t.redis.incr.mockRejectedValue(new Error('down'));
    await expect(attempt(t, proto.login, reqFrom('1.1.1.1', 'a@x.vn'), 'ok')).resolves.toBe('ok');
  });

  it('khoá Redis không chứa IP hay email thô', async () => {
    const t = build();
    await attempt(t, proto.forgotPassword, reqFrom('5.6.7.8', 'secret@x.vn'), 'ok');
    for (const key of t.counters.keys()) {
      expect(key).not.toContain('5.6.7.8');
      expect(key).not.toContain('secret');
    }
  });

  it('route khác (không gắn policy) đi thẳng qua', async () => {
    const t = build();
    await expect(attempt(t, proto.getMe, reqFrom('1.1.1.1'), 'ok')).resolves.toBe('ok');
    expect(t.redis.get).not.toHaveBeenCalled();
  });
});

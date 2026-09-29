import {
  CallHandler,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Redis as UpstashRedis } from '@upstash/redis';
import { createHash } from 'crypto';
import { Observable, catchError, concatMap } from 'rxjs';
import { clientIpOf } from '../utils/client-ip';

/**
 * Rate limit cho các route auth KHÔNG cần token (register, login, quên / đặt lại
 * mật khẩu). Trước đây chỉ form liên hệ có lớp này, nên:
 *   - `forgot-password` bắn được email đặt lại mật khẩu vô hạn tới một hộp thư;
 *   - `login` dò mật khẩu không giới hạn;
 *   - `register` trả 409 cho email đã tồn tại ⇒ dò được ai đã có tài khoản.
 *
 * Cùng nguyên tắc với ContactRateLimiter (đọc chú thích đầu file đó):
 *   - Guard CHỈ ĐỌC bộ đếm; interceptor TĂNG bộ đếm SAU khi biết kết quả. Chỉ
 *     đếm thứ ta thật sự muốn giới hạn — đăng nhập SAI, email ĐÃ GỬI — chứ
 *     không đếm request gõ nhầm bị ValidationPipe trả 400. Một cụ gõ sai định
 *     dạng email ba lần không được phép tự khoá mình ngoài cửa.
 *   - Cửa sổ cố định INCR + EXPIRE trên Upstash (bộ đếm in-memory vô dụng trên
 *     serverless).
 *   - Redis lỗi ⇒ CHO QUA. Chặn cả dòng họ khỏi đăng nhập vì Upstash sập tệ hơn
 *     nhiều so với vài phút không có rate limit.
 *
 * Khoá theo IP có thể giả qua `x-forwarded-for` (xem utils/client-ip.ts), nên
 * các policy nhạy cảm khoá THÊM theo email: đổi IP không giúp spam một hộp thư.
 */

export interface RateLimitRule {
  /** Khoá đếm theo gì. 'email' đọc từ body JSON (đã parse trước guard). */
  by: 'ip' | 'email';
  windowSeconds: number;
  max: number;
}

export interface RateLimitPolicy {
  name: string;
  rules: readonly RateLimitRule[];
  /**
   * Kết quả nào thì tính vào hạn mức. `err` = undefined khi handler thành công.
   * 400 (validation) KHÔNG BAO GIỜ được tính — xem chú thích đầu file.
   */
  countsOutcome(err?: unknown): boolean;
  /** Câu trả cho người dùng khi bị chặn. */
  message: string;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const isStatus = (err: unknown, status: number) =>
  err instanceof HttpException && err.getStatus() === status;

export const AUTH_RATE_LIMITS = {
  /** Đếm lần đăng nhập SAI mật khẩu. Đăng nhập đúng không tốn hạn mức. */
  login: {
    name: 'login',
    rules: [
      { by: 'email', windowSeconds: 15 * MINUTE, max: 10 },
      { by: 'ip', windowSeconds: HOUR, max: 30 },
    ],
    countsOutcome: (err) => err instanceof UnauthorizedException,
    message: 'Bạn đã nhập sai mật khẩu quá nhiều lần. Vui lòng thử lại sau ít phút hoặc dùng "Quên mật khẩu".',
  },
  /**
   * Đếm mỗi email ĐÃ GỬI. Service luôn trả thông điệp trung lập (chống dò
   * email) nên thành công = đã gọi Supabase gửi thư.
   */
  forgotPassword: {
    name: 'forgot-password',
    rules: [
      { by: 'email', windowSeconds: HOUR, max: 3 },
      { by: 'ip', windowSeconds: HOUR, max: 10 },
    ],
    countsOutcome: (err) => err === undefined,
    message: 'Email đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư (cả mục Spam) trước khi yêu cầu lại.',
  },
  /** Đếm token recovery sai/hết hạn — chặn dò token. */
  resetPassword: {
    name: 'reset-password',
    rules: [{ by: 'ip', windowSeconds: HOUR, max: 10 }],
    countsOutcome: (err) => err instanceof UnauthorizedException,
    message: 'Quá nhiều lần thử đặt lại mật khẩu. Vui lòng yêu cầu email mới và thử lại sau.',
  },
  /**
   * Đếm cả tạo thành công LẪN 409 "email đã tồn tại" — 409 chính là thứ kẻ dò
   * email cần. Body là multipart nên không đọc được email trong guard (multer
   * chạy trong interceptor, SAU guard) ⇒ chỉ khoá theo IP.
   */
  register: {
    name: 'register',
    rules: [
      { by: 'ip', windowSeconds: HOUR, max: 5 },
      { by: 'ip', windowSeconds: DAY, max: 20 },
    ],
    countsOutcome: (err) => err === undefined || isStatus(err, HttpStatus.CONFLICT),
    message: 'Bạn đã đăng ký quá nhiều lần. Vui lòng thử lại sau.',
  },
} as const satisfies Record<string, RateLimitPolicy>;

interface Subject {
  ip: string | null;
  email: string | null;
}

/**
 * Băm cả IP lẫn email trước khi làm khoá Redis — khoá nằm trong log và trình
 * duyệt dữ liệu của Upstash. Dùng chung muối với form liên hệ.
 */
function bucketOf(value: string): string {
  const secret = process.env.CONTACT_IP_HASH_SECRET ?? '';
  return createHash('sha256').update(`${value}${secret}`).digest('hex').slice(0, 32);
}

@Injectable()
export class AuthRateLimiter {
  private readonly logger = new Logger(AuthRateLimiter.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: UpstashRedis) {}

  /** Ném 429 nếu một rule bất kỳ đã chạm trần. KHÔNG tăng bộ đếm. */
  async assertWithinLimits(policy: RateLimitPolicy, subject: Subject): Promise<void> {
    for (const [key, rule] of this.keysFor(policy, subject)) {
      let used: number;
      try {
        used = Number((await this.redis.get<string | number>(key)) ?? 0);
      } catch (err) {
        this.logger.warn(`Redis rate limit lỗi, cho qua: ${(err as Error).message}`);
        return;
      }
      if (used >= rule.max) {
        throw new HttpException(
          { statusCode: HttpStatus.TOO_MANY_REQUESTS, error: 'Too Many Requests', message: policy.message },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  /** Tính một lần vào mọi rule của policy. Best-effort, không bao giờ ném. */
  async record(policy: RateLimitPolicy, subject: Subject): Promise<void> {
    for (const [key, rule] of this.keysFor(policy, subject)) {
      try {
        const count = await this.redis.incr(key);
        // EXPIRE chỉ ở lần đầu — giữ cửa sổ CỐ ĐỊNH (xem ContactRateLimiter).
        if (count === 1) await this.redis.expire(key, rule.windowSeconds);
      } catch (err) {
        this.logger.warn(`Không ghi được bộ đếm tần suất (non-fatal): ${(err as Error).message}`);
      }
    }
  }

  private keysFor(policy: RateLimitPolicy, subject: Subject): Array<[string, RateLimitRule]> {
    const out: Array<[string, RateLimitRule]> = [];
    for (const rule of policy.rules) {
      const value = rule.by === 'ip' ? subject.ip : subject.email;
      // Không có IP/email ⇒ bỏ rule đó (fail-open như contact).
      if (!value) continue;
      out.push([`auth:rate:${policy.name}:${rule.by}:${rule.windowSeconds}:${bucketOf(value)}`, rule]);
    }
    return out;
  }
}

const AUTH_RATE_LIMIT_KEY = 'authRateLimit';

function subjectOf(req: any): Subject {
  const rawEmail = req?.body?.email;
  return {
    ip: clientIpOf(req),
    email: typeof rawEmail === 'string' && rawEmail.trim() ? rawEmail.trim().toLowerCase() : null,
  };
}

@Injectable()
export class AuthThrottleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: AuthRateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.get<RateLimitPolicy>(AUTH_RATE_LIMIT_KEY, context.getHandler());
    if (!policy) return true;
    await this.limiter.assertWithinLimits(policy, subjectOf(context.switchToHttp().getRequest()));
    return true;
  }
}

@Injectable()
export class AuthThrottleInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: AuthRateLimiter,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const policy = this.reflector.get<RateLimitPolicy>(AUTH_RATE_LIMIT_KEY, context.getHandler());
    if (!policy) return next.handle();

    // Đọc subject SAU handler: với register, multer mới parse body lúc này —
    // nhưng register chỉ khoá theo IP nên không phụ thuộc điều đó.
    const req = context.switchToHttp().getRequest();
    // AWAIT bộ đếm trước khi trả response/lỗi: trên serverless, việc chưa xong
    // lúc response đã ghi có thể không bao giờ chạy.
    return next.handle().pipe(
      concatMap(async (value) => {
        if (policy.countsOutcome(undefined)) await this.limiter.record(policy, subjectOf(req));
        return value;
      }),
      catchError(async (err) => {
        if (policy.countsOutcome(err)) await this.limiter.record(policy, subjectOf(req));
        throw err;
      }),
    );
  }
}

/**
 * Gắn rate limit cho một route auth. Thứ tự: guard (đọc) chạy trước pipes,
 * interceptor (ghi) bọc quanh handler.
 */
export function AuthRateLimit(policy: RateLimitPolicy) {
  return applyDecorators(
    SetMetadata(AUTH_RATE_LIMIT_KEY, policy),
    UseGuards(AuthThrottleGuard),
    UseInterceptors(AuthThrottleInterceptor),
  );
}

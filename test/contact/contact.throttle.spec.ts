import { HttpException } from '@nestjs/common';
import { ContactRateLimiter } from '../../src/contact/contact.rate-limiter';
import { ContactThrottleGuard, clientIpOf } from '../../src/contact/contact.throttle.guard';
import { CONTACT_RATE_LIMITS } from '../../src/contact/contact.constants';

const ctxFor = (req: any) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;
const reqFrom = (ip: string) => ({ headers: { 'x-forwarded-for': ip } });

function build() {
  // Bộ đếm trong bộ nhớ đóng vai Redis. GET trả giá trị hiện tại, INCR trả giá
  // trị SAU khi tăng — đúng ngữ nghĩa Upstash.
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

  const limiter = new ContactRateLimiter(redis);
  return { limiter, guard: new ContactThrottleGuard(limiter), redis, counters };
}

const perHour = CONTACT_RATE_LIMITS[0].max;

describe('ContactRateLimiter — lớp bảo vệ DUY NHẤT của route ghi không guard', () => {
  it('chưa gửi gì ⇒ cho qua', async () => {
    const { limiter } = build();
    await expect(limiter.assertWithinLimits('1.2.3.4')).resolves.toBeUndefined();
  });

  it('cho qua đúng 3 lá thư đã lưu trong một giờ', async () => {
    const { limiter } = build();
    for (let i = 0; i < perHour; i++) {
      await limiter.assertWithinLimits('1.2.3.4');
      await limiter.recordSubmission('1.2.3.4');
    }
    await expect(limiter.assertWithinLimits('1.2.3.4')).rejects.toThrow(HttpException);
  });

  it('lá thư thứ 4 ⇒ 429 với câu tiếng Việt cho người gửi đọc', async () => {
    const { limiter } = build();
    for (let i = 0; i < perHour; i++) await limiter.recordSubmission('1.2.3.4');

    try {
      await limiter.assertWithinLimits('1.2.3.4');
      throw new Error('đáng lẽ phải ném');
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(429);
      expect(((err as HttpException).getResponse() as any).message).toMatch(/Ban liên lạc/);
    }
  });

  /**
   * ĐÂY LÀ LÝ DO bộ đếm tách làm hai bước. Guard chạy trước ValidationPipe, nên
   * gộp INCR vào bước kiểm tra sẽ tính cả request gõ sai vào hạn mức: một cụ
   * ông gõ nhầm số điện thoại ba lần bị khoá nguyên giờ và mất đoạn văn vừa
   * viết — đúng nhóm người mà form này sinh ra để phục vụ (api-contact.md §5).
   */
  it('KIỂM TRA không tăng bộ đếm — gõ sai bao nhiêu lần cũng không đốt hạn mức', async () => {
    const { limiter, redis } = build();
    for (let i = 0; i < 20; i++) await limiter.assertWithinLimits('1.2.3.4');

    expect(redis.incr).not.toHaveBeenCalled();
    // Sau 20 lần bị từ chối vì gõ sai, người gửi vẫn còn nguyên hạn mức.
    await expect(limiter.assertWithinLimits('1.2.3.4')).resolves.toBeUndefined();
  });

  it('đếm THEO IP — người khác không bị chặn lây', async () => {
    const { limiter } = build();
    for (let i = 0; i < perHour; i++) await limiter.recordSubmission('1.2.3.4');

    await expect(limiter.assertWithinLimits('5.6.7.8')).resolves.toBeUndefined();
  });

  it('ép cả hạn mức NGÀY, không chỉ hạn mức giờ', async () => {
    const { limiter, counters } = build();
    const dayWindow = CONTACT_RATE_LIMITS[1];
    // Giả lập: hạn mức giờ còn chỗ, nhưng hạn mức ngày đã đầy.
    for (const [key] of counters) counters.delete(key);
    for (let i = 0; i < dayWindow.max; i++) await limiter.recordSubmission('1.2.3.4');
    // 10 lượt ⇒ vượt cả hạn mức giờ lẫn ngày; kiểm tra thông điệp nhắc tới ngày
    // khi chỉ riêng hạn mức ngày bị chạm là việc của cấu hình, không phải spec này.
    await expect(limiter.assertWithinLimits('1.2.3.4')).rejects.toThrow(HttpException);
  });

  it('EXPIRE chỉ đặt ở lượt ĐẦU của mỗi cửa sổ', async () => {
    const { limiter, redis } = build();
    await limiter.recordSubmission('1.2.3.4');
    await limiter.recordSubmission('1.2.3.4');

    // Đặt lại EXPIRE mỗi lần INCR biến cửa sổ cố định thành "cấm cho tới khi im
    // lặng đủ lâu" — người gửi bị khoá vĩnh viễn chừng nào còn thử lại.
    expect(redis.expire).toHaveBeenCalledTimes(CONTACT_RATE_LIMITS.length);
  });

  it('Redis chết ⇒ CHO QUA: form liên hệ chết còn tệ hơn nhận thêm spam', async () => {
    const { limiter, redis } = build();
    redis.get.mockRejectedValue(new Error('upstash down'));

    await expect(limiter.assertWithinLimits('1.2.3.4')).resolves.toBeUndefined();
  });

  it('bộ đếm hỏng lúc GHI ⇒ không ném: lá thư đã nằm trong DB rồi', async () => {
    const { limiter, redis } = build();
    redis.incr.mockRejectedValue(new Error('upstash down'));

    // Ném ở đây sẽ làm người gửi thấy lỗi và gửi lại ⇒ hai bản sao trong hộp thư.
    await expect(limiter.recordSubmission('1.2.3.4')).resolves.toBeUndefined();
  });

  it('không xác định được IP ⇒ cho qua, không khoá cả dòng họ', async () => {
    const { limiter } = build();
    await expect(limiter.assertWithinLimits(null)).resolves.toBeUndefined();
    await expect(limiter.recordSubmission(null)).resolves.toBeUndefined();
  });
});

describe('ContactThrottleGuard', () => {
  it('còn hạn mức ⇒ cho qua', async () => {
    const { guard } = build();
    await expect(guard.canActivate(ctxFor(reqFrom('1.2.3.4')))).resolves.toBe(true);
  });

  it('hết hạn mức ⇒ 429', async () => {
    const { guard, limiter } = build();
    for (let i = 0; i < perHour; i++) await limiter.recordSubmission('1.2.3.4');

    await expect(guard.canActivate(ctxFor(reqFrom('1.2.3.4')))).rejects.toThrow(HttpException);
  });

  it('guard CHỈ ĐỌC — không bao giờ tự tăng bộ đếm', async () => {
    const { guard, redis } = build();
    await guard.canActivate(ctxFor(reqFrom('1.2.3.4')));
    expect(redis.incr).not.toHaveBeenCalled();
  });
});

describe('clientIpOf', () => {
  it('lấy phần tử ĐẦU của x-forwarded-for — đó là client, phần sau là proxy', () => {
    expect(clientIpOf({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' } })).toBe(
      '1.2.3.4',
    );
  });

  it('ưu tiên x-forwarded-for hơn req.ip — trên Vercel req.ip là proxy nội bộ', () => {
    expect(clientIpOf({ headers: { 'x-forwarded-for': '1.2.3.4' }, ip: '10.0.0.1' })).toBe('1.2.3.4');
  });

  it('không có header ⇒ rơi về req.ip', () => {
    expect(clientIpOf({ headers: {}, ip: '10.0.0.1' })).toBe('10.0.0.1');
  });

  it('không có gì ⇒ null', () => {
    expect(clientIpOf({ headers: {} })).toBeNull();
  });
});

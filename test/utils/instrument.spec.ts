import { parseSampleRate, scrubEvent, scrubSpan } from '../../src/instrument';

describe('scrubEvent — không gì nhạy cảm rời server', () => {
  it('bỏ body, cookie, query (token tắt nhắc) và header xác thực / IP / chữ ký QStash', () => {
    const event = scrubEvent({
      request: {
        url: 'https://api.giapha.vn/v2/notifications/unsubscribe?token=user.sig',
        query_string: 'token=user.sig',
        data: { email: 'a@x.vn', password: 'bí mật' },
        cookies: { sid: 'x' },
        headers: {
          Authorization: 'Bearer jwt',
          cookie: 'sid=x',
          'x-forwarded-for': '1.2.3.4',
          'Upstash-Signature': 'sig',
          'user-agent': 'Mozilla',
        },
      },
    });
    expect(event.request).toEqual({
      url: 'https://api.giapha.vn/v2/notifications/unsubscribe',
      headers: { 'user-agent': 'Mozilla' },
    });
  });

  it('sự kiện không có request đi qua nguyên vẹn', () => {
    expect(scrubEvent({ message: 'x' } as any)).toEqual({ message: 'x' });
  });
});

describe('scrubSpan — span tracing không mang query string', () => {
  it('gỡ query khỏi tên và thuộc tính URL (cả dạng { value }), bỏ url.query', () => {
    const span = scrubSpan({
      name: 'GET /v2/notifications/unsubscribe?token=user.sig',
      attributes: {
        'url.full': { value: 'https://api.giapha.vn/v2/notifications/unsubscribe?token=user.sig', type: 'string' },
        'http.url': 'https://bucket.r2.dev/a.jpg?X-Amz-Signature=abc',
        'url.query': 'token=user.sig',
        'http.response.status_code': 200,
      },
    });
    expect(span).toEqual({
      name: 'GET /v2/notifications/unsubscribe',
      attributes: {
        'url.full': { value: 'https://api.giapha.vn/v2/notifications/unsubscribe', type: 'string' },
        'http.url': 'https://bucket.r2.dev/a.jpg',
        'http.response.status_code': 200,
      },
    });
  });
});

describe('parseSampleRate', () => {
  it('dùng mặc định khi trống hoặc sai, nhận giá trị 0..1', () => {
    expect(parseSampleRate(undefined, 0.2)).toBe(0.2);
    expect(parseSampleRate('', 0.2)).toBe(0.2);
    expect(parseSampleRate('abc', 0.2)).toBe(0.2);
    expect(parseSampleRate('1.5', 0.2)).toBe(0.2);
    expect(parseSampleRate('0', 0.2)).toBe(0);
    expect(parseSampleRate('1', 0.2)).toBe(1);
  });
});

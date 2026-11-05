import { parseLogLevel, parseSampleRate, scrubEvent, scrubLog, scrubSpan } from '../../src/instrument';

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

describe('Sentry Logs — parseLogLevel / scrubLog', () => {
  const info = parseLogLevel('info');

  it('parseLogLevel: mức hợp lệ, off, và fallback khi lạ / rỗng', () => {
    expect(parseLogLevel('warn')).toBe(3);
    expect(parseLogLevel(' DEBUG ')).toBe(1);
    expect(parseLogLevel('off')).toBe(6);
    expect(parseLogLevel('verbose')).toBe(2);
    expect(parseLogLevel(undefined)).toBe(2);
  });

  it('bỏ log dưới ngưỡng, giữ log từ ngưỡng trở lên', () => {
    expect(scrubLog({ level: 'debug' }, info)).toBeNull();
    expect(scrubLog({ level: 'info' }, info)).toEqual({ level: 'info' });
    expect(scrubLog({ level: 'fatal' }, parseLogLevel('error'))).toEqual({ level: 'fatal' });
    expect(scrubLog({ level: 'fatal' }, parseLogLevel('off'))).toBeNull();
  });

  it('che thuộc tính nhạy cảm theo tên, không đụng khoá vô hại', () => {
    const log = scrubLog(
      {
        level: 'info',
        attributes: {
          'user.email': 'a@x.vn',
          'user.ip_address': '1.2.3.4',
          'client.address': '1.2.3.4',
          reset_token: 'abc',
          'user.id': 'uuid-1',
          'reminder.recipients': 3,
          description: 'ok',
        },
      },
      info,
    )!;
    expect(log.attributes).toEqual({
      'user.email': '[Filtered]',
      'user.ip_address': '[Filtered]',
      'client.address': '[Filtered]',
      reset_token: '[Filtered]',
      'user.id': 'uuid-1',
      'reminder.recipients': 3,
      description: 'ok',
    });
  });

  it('cắt query khỏi URL và che email trong chuỗi (cả dạng { value })', () => {
    const log = scrubLog(
      {
        level: 'error',
        attributes: {
          'url.full': 'https://api.giapha.vn/v2/notifications/unsubscribe?token=user.sig',
          'error.message': { value: 'Recipient "a.b@x.vn" rejected', type: 'string' },
          note: 'what? not a url',
        },
      },
      info,
    )!;
    expect(log.attributes).toEqual({
      'url.full': 'https://api.giapha.vn/v2/notifications/unsubscribe',
      'error.message': { value: 'Recipient "[email]" rejected', type: 'string' },
      note: 'what? not a url',
    });
  });
});

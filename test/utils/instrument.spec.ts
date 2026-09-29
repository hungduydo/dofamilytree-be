import { scrubEvent } from '../../src/instrument';

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

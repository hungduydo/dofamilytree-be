import { flushTelemetry, scrubSpanAttributes } from '../../src/telemetry';

describe('scrubSpanAttributes — query string không rời server qua trace', () => {
  it('gỡ query khỏi URL (token tắt nhắc, chữ ký presign) và bỏ url.query', () => {
    const attrs: Record<string, unknown> = {
      'url.full': 'https://api.giapha.vn/v2/notifications/unsubscribe?token=user.sig',
      'http.url': 'https://bucket.r2.dev/a.jpg?X-Amz-Signature=abc',
      'http.target': '/v2/notifications/unsubscribe?token=user.sig',
      'url.query': 'token=user.sig',
      'url.path': '/v2/notifications/unsubscribe',
      'http.response.status_code': 500,
    };
    scrubSpanAttributes(attrs);
    expect(attrs).toEqual({
      'url.full': 'https://api.giapha.vn/v2/notifications/unsubscribe',
      'http.url': 'https://bucket.r2.dev/a.jpg',
      'http.target': '/v2/notifications/unsubscribe',
      'url.path': '/v2/notifications/unsubscribe',
      'http.response.status_code': 500,
    });
  });

  it('flushTelemetry là no-op khi OTel tắt (không có OTEL_EXPORTER_OTLP_ENDPOINT)', async () => {
    await expect(flushTelemetry()).resolves.toBeUndefined();
  });
});

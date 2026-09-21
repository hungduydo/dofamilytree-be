import { MailService } from '../../src/mail/mail.service';

const MESSAGE = { to: ['admin@ho.vn'], subject: 'S', text: 'T', html: '<p>T</p>' };

describe('MailService', () => {
  const env = process.env;
  const fetchMock = jest.fn();

  beforeEach(() => {
    process.env = { ...env, RESEND_API_KEY: 're_test', MAIL_FROM: 'Gia Phả <no-reply@ho.vn>' };
    fetchMock.mockReset();
    global.fetch = fetchMock as any;
  });
  afterAll(() => {
    process.env = env;
  });

  it('chưa cấu hình khi thiếu key hoặc người gửi', () => {
    delete process.env.MAIL_FROM;
    expect(new MailService().isConfigured()).toBe(false);
  });

  it('ném khi chưa cấu hình — không giả vờ đã gửi', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(new MailService().send(MESSAGE)).rejects.toThrow('RESEND_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gọi Resend với key, người gửi và nội dung', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await new MailService().send(MESSAGE);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body)).toEqual({ from: 'Gia Phả <no-reply@ho.vn>', ...MESSAGE });
  });

  it('ném khi Resend trả lỗi, để QStash retry', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => 'domain not verified' });
    await expect(new MailService().send(MESSAGE)).rejects.toThrow('Resend trả 422: domain not verified');
  });
});

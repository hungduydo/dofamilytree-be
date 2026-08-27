import { queueCallbackUrl } from '../../src/queue/queue.constants';

const mockVerify = jest.fn();
jest.mock('@upstash/qstash', () => ({
  Receiver: jest.fn().mockImplementation(() => ({ verify: mockVerify })),
}));

/**
 * Guard được dựng LẠI cho mỗi test vì receiver được khởi tạo ở field initializer
 * — tức là đọc env NGAY lúc new. jest.resetModules() để mỗi lần require lại
 * class là một lần đọc env mới.
 */
function newGuard() {
  jest.resetModules();
  const { QStashSignatureGuard } = require('../../src/queue/qstash-signature.guard');
  return new QStashSignatureGuard();
}

const ctxFor = (req: any) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;

/**
 * Kiểm tra theo HTTP status chứ không theo constructor: jest.resetModules() nạp
 * lại cả @nestjs/common, nên UnauthorizedException mà guard ném là một class
 * KHÁC identity với class import ở đầu file dù cùng tên.
 */
async function expect401(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ status: 401 });
}

const signedRequest = (overrides: any = {}) => ({
  headers: { 'upstash-signature': 'sig-abc' },
  rawBody: Buffer.from('{"memberId":"m1"}'),
  params: { task: 'avatar-upload' },
  ...overrides,
});

describe('QStashSignatureGuard', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('có signing key', () => {
    beforeEach(() => {
      process.env.QSTASH_CURRENT_SIGNING_KEY = 'cur';
      process.env.QSTASH_NEXT_SIGNING_KEY = 'next';
    });

    it('chữ ký hợp lệ → cho qua', async () => {
      mockVerify.mockResolvedValue(true);
      await expect(newGuard().canActivate(ctxFor(signedRequest()))).resolves.toBe(true);
    });

    // Chữ ký của QStash ký cả URL. Guard PHẢI dựng URL bằng đúng hàm mà
    // publisher dùng, không phải từ host của request (Vercel rewrite proto/host).
    it('verify đúng URL mà publisher đã dùng', async () => {
      mockVerify.mockResolvedValue(true);
      await newGuard().canActivate(ctxFor(signedRequest()));
      expect(mockVerify).toHaveBeenCalledWith(
        expect.objectContaining({ url: queueCallbackUrl('avatar-upload') }),
      );
    });

    it('chữ ký sai → 401', async () => {
      mockVerify.mockResolvedValue(false);
      await expect401(newGuard().canActivate(ctxFor(signedRequest())));
    });

    it('verify ném lỗi → 401 chứ không 500', async () => {
      mockVerify.mockRejectedValue(new Error('boom'));
      await expect401(newGuard().canActivate(ctxFor(signedRequest())));
    });

    it('thiếu header chữ ký → 401', async () => {
      await expect401(newGuard().canActivate(ctxFor(signedRequest({ headers: {} }))));
    });

    // rawBody undefined = bootstrap quên `rawBody: true`. Fail closed.
    it('thiếu rawBody → 401', async () => {
      await expect401(newGuard().canActivate(ctxFor(signedRequest({ rawBody: undefined }))));
    });
  });

  describe('thiếu signing key', () => {
    beforeEach(() => {
      delete process.env.QSTASH_CURRENT_SIGNING_KEY;
      delete process.env.QSTASH_NEXT_SIGNING_KEY;
    });

    it('production → 401 (thiếu key là lỗi cấu hình, không được im lặng cho qua)', async () => {
      process.env.NODE_ENV = 'production';
      await expect401(newGuard().canActivate(ctxFor(signedRequest())));
    });

    it('dev/test → cho qua kèm cảnh báo', async () => {
      process.env.NODE_ENV = 'test';
      await expect(newGuard().canActivate(ctxFor(signedRequest()))).resolves.toBe(true);
    });
  });
});

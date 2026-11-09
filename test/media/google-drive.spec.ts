import {
  getDriveFileMeta, downloadDriveFile, DriveApiError, DriveFileTooLargeError, DriveAuth,
  fromStoredDriveAuth, toStoredDriveAuth,
} from '../../src/media/google-drive';

const FILE_ID = '1AbCdEfGhIjKlMnOpQrStUv';
const OTHER_ID = '1ZzZzZzZzZzZzZzZzZzZzZz';
const TOKEN: DriveAuth = { kind: 'token', accessToken: 'tok' };
const LINK: DriveAuth = {
  kind: 'apiKey',
  apiKey: 'server-key',
  resourceKeys: [`${FILE_ID}/0-rk1`, `${OTHER_ID}/0-rk2`],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('google-drive client', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  describe('getDriveFileMeta', () => {
    it('gửi Bearer token, bật supportsAllDrives và ép size về number', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { id: FILE_ID, name: 'a.jpg', mimeType: 'image/jpeg', size: '26214400' }),
      );
      const meta = await getDriveFileMeta(TOKEN, FILE_ID);

      expect(meta).toEqual({ id: FILE_ID, name: 'a.jpg', mimeType: 'image/jpeg', size: 26214400, trashed: false });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain(`/drive/v3/files/${FILE_ID}?`);
      expect(url).toContain('supportsAllDrives=true');
      expect(init.headers.Authorization).toBe('Bearer tok');
    });

    it('401 ⇒ lỗi auth, không retry', async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, { error: { message: 'Invalid Credentials' } }));
      const err = await getDriveFileMeta(TOKEN, FILE_ID).catch((e) => e);
      expect(err).toBeInstanceOf(DriveApiError);
      expect(err.isAuthError).toBe(true);
      expect(err.retryable).toBe(false);
    });

    it('403 rate limit ⇒ retry được; 403 không có quyền ⇒ không', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }),
      );
      expect((await getDriveFileMeta(TOKEN, FILE_ID).catch((e) => e)).retryable).toBe(true);

      fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: { errors: [{ reason: 'forbidden' }] } }));
      expect((await getDriveFileMeta(TOKEN, FILE_ID).catch((e) => e)).retryable).toBe(false);
    });

    it('5xx và lỗi mạng ⇒ retry được', async () => {
      fetchMock.mockResolvedValueOnce(new Response('oops', { status: 503 }));
      expect((await getDriveFileMeta(TOKEN, FILE_ID).catch((e) => e)).retryable).toBe(true);

      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
      expect((await getDriveFileMeta(TOKEN, FILE_ID).catch((e) => e)).retryable).toBe(true);
    });

    it('chặn ID lạ trước khi gọi mạng', async () => {
      await expect(getDriveFileMeta(TOKEN, '../../etc/passwd')).rejects.toBeInstanceOf(DriveApiError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('downloadDriveFile', () => {
    it('trả về toàn bộ nội dung', async () => {
      fetchMock.mockResolvedValue(new Response(Buffer.from('hello world')));
      const buf = await downloadDriveFile(TOKEN, FILE_ID, 1024);
      expect(buf.toString()).toBe('hello world');
      expect(fetchMock.mock.calls[0][0]).toContain('alt=media');
    });

    it('dừng khi vượt trần dù content-length không khai', async () => {
      fetchMock.mockResolvedValue(new Response(Buffer.alloc(2048)));
      await expect(downloadDriveFile(TOKEN, FILE_ID, 1024)).rejects.toBeInstanceOf(DriveFileTooLargeError);
    });

    it('từ chối sớm theo content-length', async () => {
      fetchMock.mockResolvedValue(
        new Response(Buffer.alloc(10), { headers: { 'content-length': String(5000) } }),
      );
      await expect(downloadDriveFile(TOKEN, FILE_ID, 1024)).rejects.toBeInstanceOf(DriveFileTooLargeError);
    });
  });
  describe('chế độ link chia sẻ (API key)', () => {
    it('metadata: gửi ?key= và resource key của đúng file, không có Authorization', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { id: FILE_ID, name: 'a.jpg', mimeType: 'image/jpeg' }));
      await getDriveFileMeta(LINK, FILE_ID);

      const [url, init] = fetchMock.mock.calls[0];
      const qs = new URL(url).searchParams;
      expect(qs.get('key')).toBe('server-key');
      expect(qs.get('supportsAllDrives')).toBe('true');
      expect(init.headers.Authorization).toBeUndefined();
      expect(init.headers['X-Goog-Drive-Resource-Keys']).toBe(`${FILE_ID}/0-rk1`);
    });

    it('download: gửi ?key=&alt=media, resource key, không có Authorization', async () => {
      fetchMock.mockResolvedValue(new Response(Buffer.from('bytes')));
      const buf = await downloadDriveFile(LINK, FILE_ID, 1024);

      expect(buf.toString()).toBe('bytes');
      const [url, init] = fetchMock.mock.calls[0];
      const qs = new URL(url).searchParams;
      expect(qs.get('key')).toBe('server-key');
      expect(qs.get('alt')).toBe('media');
      expect(init.headers.Authorization).toBeUndefined();
      expect(init.headers['X-Goog-Drive-Resource-Keys']).toBe(`${FILE_ID}/0-rk1`);
    });

    it('file không có resource key ⇒ không gửi header', async () => {
      fetchMock.mockResolvedValue(new Response(Buffer.from('x')));
      await downloadDriveFile({ ...LINK, resourceKeys: [] }, FILE_ID, 1024);
      expect(fetchMock.mock.calls[0][1].headers['X-Goog-Drive-Resource-Keys']).toBeUndefined();
    });

    it('token mode không gửi key', async () => {
      fetchMock.mockResolvedValue(new Response(Buffer.from('x')));
      await downloadDriveFile(TOKEN, FILE_ID, 1024);
      expect(new URL(fetchMock.mock.calls[0][0]).searchParams.has('key')).toBe(false);
    });
  });

  describe('lưu/khôi phục auth qua Redis', () => {
    const env = process.env;
    afterEach(() => {
      process.env = env;
    });

    it('chế độ link KHÔNG BAO GIỜ lưu API key', () => {
      const stored = toStoredDriveAuth(LINK);
      expect(stored).toEqual({ kind: 'apiKey', resourceKeys: LINK.kind === 'apiKey' ? LINK.resourceKeys : [] });
      expect(JSON.stringify(stored)).not.toContain('server-key');
    });

    it('dựng lại key từ env', () => {
      process.env = { ...env, GOOGLE_DRIVE_API_KEY: 'env-key' };
      expect(fromStoredDriveAuth({ kind: 'apiKey', resourceKeys: ['a/b'] })).toEqual({
        auth: { kind: 'apiKey', apiKey: 'env-key', resourceKeys: ['a/b'] },
      });
    });

    it('env mất key ⇒ not_configured', () => {
      process.env = { ...env, GOOGLE_DRIVE_API_KEY: '' };
      expect(fromStoredDriveAuth({ kind: 'apiKey', resourceKeys: [] })).toEqual({ error: 'not_configured' });
    });

    it('token: dạng mới và dạng cũ { access_token }', () => {
      expect(fromStoredDriveAuth(toStoredDriveAuth(TOKEN))).toEqual({ auth: TOKEN });
      expect(fromStoredDriveAuth({ access_token: 'tok' })).toEqual({ auth: TOKEN });
    });

    it('không có gì / rác ⇒ expired', () => {
      expect(fromStoredDriveAuth(null)).toEqual({ error: 'expired' });
      expect(fromStoredDriveAuth({ kind: 'token' })).toEqual({ error: 'expired' });
    });
  });
});

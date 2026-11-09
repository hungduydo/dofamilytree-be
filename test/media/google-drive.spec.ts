import {
  getDriveFileMeta, downloadDriveFile, DriveApiError, DriveFileTooLargeError,
} from '../../src/media/google-drive';

const FILE_ID = '1AbCdEfGhIjKlMnOpQrStUv';

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
      const meta = await getDriveFileMeta('tok', FILE_ID);

      expect(meta).toEqual({ id: FILE_ID, name: 'a.jpg', mimeType: 'image/jpeg', size: 26214400, trashed: false });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain(`/drive/v3/files/${FILE_ID}?`);
      expect(url).toContain('supportsAllDrives=true');
      expect(init.headers.Authorization).toBe('Bearer tok');
    });

    it('401 ⇒ lỗi auth, không retry', async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, { error: { message: 'Invalid Credentials' } }));
      const err = await getDriveFileMeta('tok', FILE_ID).catch((e) => e);
      expect(err).toBeInstanceOf(DriveApiError);
      expect(err.isAuthError).toBe(true);
      expect(err.retryable).toBe(false);
    });

    it('403 rate limit ⇒ retry được; 403 không có quyền ⇒ không', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }),
      );
      expect((await getDriveFileMeta('tok', FILE_ID).catch((e) => e)).retryable).toBe(true);

      fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: { errors: [{ reason: 'forbidden' }] } }));
      expect((await getDriveFileMeta('tok', FILE_ID).catch((e) => e)).retryable).toBe(false);
    });

    it('5xx và lỗi mạng ⇒ retry được', async () => {
      fetchMock.mockResolvedValueOnce(new Response('oops', { status: 503 }));
      expect((await getDriveFileMeta('tok', FILE_ID).catch((e) => e)).retryable).toBe(true);

      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
      expect((await getDriveFileMeta('tok', FILE_ID).catch((e) => e)).retryable).toBe(true);
    });

    it('chặn ID lạ trước khi gọi mạng', async () => {
      await expect(getDriveFileMeta('tok', '../../etc/passwd')).rejects.toBeInstanceOf(DriveApiError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('downloadDriveFile', () => {
    it('trả về toàn bộ nội dung', async () => {
      fetchMock.mockResolvedValue(new Response(Buffer.from('hello world')));
      const buf = await downloadDriveFile('tok', FILE_ID, 1024);
      expect(buf.toString()).toBe('hello world');
      expect(fetchMock.mock.calls[0][0]).toContain('alt=media');
    });

    it('dừng khi vượt trần dù content-length không khai', async () => {
      fetchMock.mockResolvedValue(new Response(Buffer.alloc(2048)));
      await expect(downloadDriveFile('tok', FILE_ID, 1024)).rejects.toBeInstanceOf(DriveFileTooLargeError);
    });

    it('từ chối sớm theo content-length', async () => {
      fetchMock.mockResolvedValue(
        new Response(Buffer.alloc(10), { headers: { 'content-length': String(5000) } }),
      );
      await expect(downloadDriveFile('tok', FILE_ID, 1024)).rejects.toBeInstanceOf(DriveFileTooLargeError);
    });
  });
});

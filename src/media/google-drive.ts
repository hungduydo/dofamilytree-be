/**
 * Client tối giản cho Google Drive API v3 — chỉ hai thao tác mà luồng import
 * cần: đọc metadata và tải nội dung file. Dùng `fetch` toàn cục (không kéo
 * `googleapis` ~80MB vào bundle function).
 *
 * Hai cách xác thực (`DriveAuth`):
 * - `token`: access token do FE lấy qua Google Picker (scope `drive.file`);
 *   backend KHÔNG giữ refresh token — token sống ~1 giờ, đủ cho một đợt import.
 * - `apiKey`: import từ link chia sẻ ("Bất kỳ ai có đường liên kết"). Dùng key
 *   server `GOOGLE_DRIVE_API_KEY` (khác key của FE — key FE bị khoá theo
 *   referrer nên mọi lời gọi từ server đều 403) kèm header
 *   `X-Goog-Drive-Resource-Keys` cho file cũ được bảo vệ bằng resource key.
 */

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

/** ID file Drive: chữ, số, `-`, `_`. Chặn sớm để không nội suy chuỗi lạ vào URL. */
export const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

/**
 * Dạng lưu trong Redis (`mediaDriveTokenKey`). Chế độ link chỉ giữ resource
 * key — API key đọc lại từ env lúc job chạy, không bao giờ nằm trong Redis.
 */
export type StoredDriveAuth =
  | { kind: 'token'; accessToken: string }
  | { kind: 'apiKey'; resourceKeys: string[] };

/** Key server cho chế độ link; `undefined` khi chưa cấu hình. */
export function driveServerApiKey(): string | undefined {
  return process.env.GOOGLE_DRIVE_API_KEY?.trim() || undefined;
}

export function toStoredDriveAuth(auth: DriveAuth): StoredDriveAuth {
  return auth.kind === 'token'
    ? { kind: 'token', accessToken: auth.accessToken }
    : { kind: 'apiKey', resourceKeys: auth.resourceKeys };
}

/**
 * Dựng lại `DriveAuth` từ Redis. Chấp nhận cả dạng cũ `{ access_token }` (đợt
 * import xếp hàng trước khi bản này deploy).
 * - `expired`: không có gì trong Redis (TTL hết) hoặc dữ liệu hỏng.
 * - `not_configured`: batch link nhưng env không còn `GOOGLE_DRIVE_API_KEY`.
 */
export function fromStoredDriveAuth(
  stored: unknown,
): { auth: DriveAuth } | { error: 'expired' | 'not_configured' } {
  if (!stored || typeof stored !== 'object') return { error: 'expired' };
  const s = stored as Record<string, unknown>;
  if (s.kind === 'token' && typeof s.accessToken === 'string' && s.accessToken) {
    return { auth: { kind: 'token', accessToken: s.accessToken } };
  }
  if (typeof s.access_token === 'string' && s.access_token) {
    return { auth: { kind: 'token', accessToken: s.access_token } };
  }
  if (s.kind === 'apiKey') {
    const apiKey = driveServerApiKey();
    if (!apiKey) return { error: 'not_configured' };
    const resourceKeys = Array.isArray(s.resourceKeys)
      ? s.resourceKeys.filter((k): k is string => typeof k === 'string')
      : [];
    return { auth: { kind: 'apiKey', apiKey, resourceKeys } };
  }
  return { error: 'expired' };
}

/** Một phần tử `fileId/resourceKey` — đúng định dạng header `X-Goog-Drive-Resource-Keys`. */
export const DRIVE_RESOURCE_KEY_PATTERN = /^[A-Za-z0-9_-]{10,200}\/[A-Za-z0-9_-]{1,200}$/;

/** Cách xác thực một lời gọi Drive — xem đầu file. */
export type DriveAuth =
  | { kind: 'token'; accessToken: string }
  | { kind: 'apiKey'; apiKey: string; resourceKeys: string[] };

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  /** Byte. Không có với file Google Docs/Sheets (không tải được bằng alt=media). */
  size: number | null;
  trashed: boolean;
}

/**
 * Lỗi từ Drive API. `retryable` quyết định job có nên ném để QStash retry hay
 * đánh dấu `failed` luôn: retry không bao giờ sửa được token hết hạn (401),
 * file không có quyền / không tồn tại (403/404).
 */
export class DriveApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'DriveApiError';
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }
}

/** Lỗi khi file vượt trần size — không retry. */
export class DriveFileTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`File vượt quá giới hạn ${limitBytes} byte cho import từ Google Drive`);
    this.name = 'DriveFileTooLargeError';
  }
}

async function toDriveError(res: Response): Promise<DriveApiError> {
  let reason: string | undefined;
  let message = `Google Drive API trả ${res.status}`;
  try {
    const body = (await res.json()) as {
      error?: { message?: string; errors?: Array<{ reason?: string }> };
    };
    reason = body.error?.errors?.[0]?.reason;
    if (body.error?.message) message = `${message}: ${body.error.message}`;
  } catch {
    // Body không phải JSON — giữ message mặc định.
  }
  // 403 của Drive có hai nghĩa: hết quota (thử lại được) hoặc không có quyền (không).
  const rateLimited = res.status === 403 && /rateLimit/i.test(reason ?? '');
  const retryable = res.status === 429 || res.status >= 500 || rateLimited;
  return new DriveApiError(message, res.status, retryable, reason);
}

/** fetch hỏng ở tầng mạng (DNS, reset…) ⇒ luôn thử lại được. */
async function driveFetch(fileId: string, params: Record<string, string>, auth: DriveAuth): Promise<Response> {
  const headers: Record<string, string> = {};
  if (auth.kind === 'token') {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  } else {
    params = { ...params, key: auth.apiKey };
    // Chỉ gửi resource key của chính file này — header gọn, không lộ link file khác.
    const keys = auth.resourceKeys.filter((rk) => rk.startsWith(`${fileId}/`));
    if (keys.length > 0) headers['X-Goog-Drive-Resource-Keys'] = keys.join(',');
  }
  const url = fileUrl(fileId, params);
  try {
    return await fetch(url, { headers });
  } catch (err) {
    throw new DriveApiError(`Không kết nối được Google Drive: ${(err as Error).message}`, 0, true);
  }
}

function fileUrl(fileId: string, params: Record<string, string>): string {
  if (!DRIVE_FILE_ID_PATTERN.test(fileId)) {
    throw new DriveApiError(`ID file Google Drive không hợp lệ`, 400, false);
  }
  // supportsAllDrives: file nằm trong Shared Drive vẫn đọc được.
  const qs = new URLSearchParams({ supportsAllDrives: 'true', ...params });
  return `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?${qs}`;
}

export async function getDriveFileMeta(auth: DriveAuth, fileId: string): Promise<DriveFileMeta> {
  const res = await driveFetch(fileId, { fields: 'id,name,mimeType,size,trashed' }, auth);
  if (!res.ok) throw await toDriveError(res);
  const body = (await res.json()) as {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    trashed?: boolean;
  };
  return {
    id: body.id,
    name: body.name,
    mimeType: body.mimeType,
    size: body.size !== undefined ? Number(body.size) : null,
    trashed: Boolean(body.trashed),
  };
}

/**
 * Tải toàn bộ nội dung file vào bộ nhớ, dừng ngay khi vượt `maxBytes` — không
 * tin `size` trong metadata (file có thể bị thay giữa lúc chọn và lúc tải).
 */
export async function downloadDriveFile(
  auth: DriveAuth,
  fileId: string,
  maxBytes: number,
): Promise<Buffer> {
  const res = await driveFetch(fileId, { alt: 'media' }, auth);
  if (!res.ok) throw await toDriveError(res);

  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new DriveFileTooLargeError(maxBytes);
  }
  if (!res.body) return Buffer.alloc(0);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new DriveFileTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof DriveFileTooLargeError) throw err;
    throw new DriveApiError(`Tải file từ Google Drive bị ngắt: ${(err as Error).message}`, 0, true);
  }
  return Buffer.concat(chunks, total);
}

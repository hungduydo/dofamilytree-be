/**
 * Client tối giản cho Google Drive API v3 — chỉ hai thao tác mà luồng import
 * cần: đọc metadata và tải nội dung file. Dùng `fetch` toàn cục (không kéo
 * `googleapis` ~80MB vào bundle function).
 *
 * Access token do FE lấy qua Google Picker (scope `drive.file`) và gửi lên;
 * backend KHÔNG giữ refresh token — token sống ~1 giờ, đủ cho một đợt import.
 */

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

/** ID file Drive: chữ, số, `-`, `_`. Chặn sớm để không nội suy chuỗi lạ vào URL. */
export const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

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
async function driveFetch(url: string, accessToken: string): Promise<Response> {
  try {
    return await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
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

export async function getDriveFileMeta(accessToken: string, fileId: string): Promise<DriveFileMeta> {
  const res = await driveFetch(fileUrl(fileId, { fields: 'id,name,mimeType,size,trashed' }), accessToken);
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
  accessToken: string,
  fileId: string,
  maxBytes: number,
): Promise<Buffer> {
  const res = await driveFetch(fileUrl(fileId, { alt: 'media' }), accessToken);
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

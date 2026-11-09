export const QUEUE_AVATAR_UPLOAD = 'avatar-upload';
export const QUEUE_REPORT_GENERATE = 'report-generate';
export const QUEUE_NOTIFICATION = 'notification';
export const QUEUE_IMAGE_PROCESS = 'image-process';
export const QUEUE_GENERATION_RECOMPUTE = 'generation-recompute';
export const QUEUE_ACCOUNT_PENDING = 'account-pending';
/** Lịch QStash hằng ngày, không ai publish tay — scripts/setup-qstash-schedules.ts. */
export const QUEUE_ANNIVERSARY_REMINDER = 'anniversary-reminder';
/** Một job / một file: kéo file từ Google Drive về storage (MediaService.importFromGoogleDrive). */
export const QUEUE_DRIVE_IMPORT = 'drive-import';

/**
 * URL callback mà QStash sẽ gọi. Publisher và guard xác thực chữ ký PHẢI dùng
 * CHUNG hàm này: chữ ký của QStash ký cả URL, nên nếu guard tự dựng lại URL từ
 * request (proto/host bị Vercel rewrite) thì mọi job sẽ 401 dù chữ ký hợp lệ.
 */
export function queueCallbackUrl(task: string): string {
  let appUrl = process.env.APP_URL || 'http://localhost:3002';
  if (!/^https?:\/\//i.test(appUrl)) appUrl = `https://${appUrl}`;
  return `${appUrl}/v2/queue/callback/${task}`;
}

/**
 * QStash có gọi ngược về được app này không. Cần QSTASH_TOKEN VÀ một APP_URL
 * public — dev-local (`localhost`) thì QStash không với tới, nên job phải chạy
 * thẳng trong process (runInBackground) thay vì publish rồi chờ callback.
 */
export function qstashCallbacksReachable(): boolean {
  if (!process.env.QSTASH_TOKEN) return false;
  const appUrl = process.env.APP_URL || '';
  return !/(^|\/\/)(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(appUrl) && appUrl !== '';
}

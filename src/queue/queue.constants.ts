export const QUEUE_AVATAR_UPLOAD = 'avatar-upload';
export const QUEUE_REPORT_GENERATE = 'report-generate';
export const QUEUE_NOTIFICATION = 'notification';
export const QUEUE_IMAGE_PROCESS = 'image-process';
export const QUEUE_GENERATION_RECOMPUTE = 'generation-recompute';

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

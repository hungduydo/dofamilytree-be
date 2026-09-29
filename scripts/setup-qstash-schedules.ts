/**
 * Đăng ký các lịch QStash định kỳ (hiện có: nhắc ngày giỗ hằng ngày).
 *
 * App chạy serverless nên không có cron trong tiến trình; QStash gọi ngược
 * POST /v2/queue/callback/<task> theo lịch, ký chữ ký như mọi job khác.
 *
 * IDEMPOTENT: mỗi lịch có scheduleId cố định — chạy lại chỉ GHI ĐÈ lịch cũ
 * (đổi giờ, đổi URL khi APP_URL đổi), không đẻ thêm lịch trùng.
 *
 * Cần: QSTASH_TOKEN, APP_URL (URL production — QStash phải gọi tới được).
 *
 * Usage:
 *   pnpm qstash:schedules -- --dry-run   # in ra lịch sẽ đăng ký
 *   pnpm qstash:schedules                # đăng ký / cập nhật
 *   pnpm qstash:schedules -- --list      # xem lịch đang có trên QStash
 */

import { Client } from '@upstash/qstash';
import { QUEUE_ANNIVERSARY_REMINDER, queueCallbackUrl } from '../src/queue/queue.constants';

const SCHEDULES = [
  {
    scheduleId: 'anniversary-reminder-daily',
    task: QUEUE_ANNIVERSARY_REMINDER,
    // 00:00 UTC = 07:00 giờ VN: đủ sớm để thu xếp trong ngày, không đánh thức ai.
    cron: '0 0 * * *',
  },
] as const;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const list = process.argv.includes('--list');

  if (!process.env.APP_URL && !list) {
    throw new Error('Thiếu APP_URL — QStash cần URL production để gọi ngược');
  }

  for (const s of SCHEDULES) {
    console.log(`${s.scheduleId}: ${s.cron} → ${queueCallbackUrl(s.task)}`);
  }
  if (dryRun) return console.log('--dry-run: không đăng ký gì.');

  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('Thiếu QSTASH_TOKEN');
  const client = new Client({ token });

  if (list) {
    for (const s of await client.schedules.list()) {
      console.log(`- ${s.scheduleId}  ${s.cron}  ${s.destination}${s.isPaused ? '  (PAUSED)' : ''}`);
    }
    return;
  }

  for (const s of SCHEDULES) {
    await client.schedules.create({
      scheduleId: s.scheduleId,
      destination: queueCallbackUrl(s.task),
      cron: s.cron,
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
      retries: 3,
    });
    console.log(`✓ ${s.scheduleId}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

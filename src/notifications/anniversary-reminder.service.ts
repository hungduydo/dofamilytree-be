import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis as UpstashRedis } from '@upstash/redis';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SupabaseUsersService } from '../supabase/supabase-users.service';
import { ANNIVERSARY_INCLUDE, toAnniversaryDto } from '../events/events.service';
import { parseIsoDay } from '../events/anniversary-occurrence';
import { todayInVietnam } from '../memorial/memorial.service';
import {
  REMINDER_DAYS_BEFORE,
  buildAnniversaryReminderEmail,
  relativesToRemember,
  remindersFor,
} from './anniversary-reminder';
import { createUnsubscribeToken } from './unsubscribe-token';

/** Ai được nhận: người trong họ đã được duyệt. Editor là nhân sự thuê ngoài. */
const RECIPIENT_ROLES = ['member', 'admin'];

/** Khoá "đã gửi" sống lâu hơn cửa sổ retry của QStash (vài giờ). */
const SENT_KEY_TTL_SECONDS = 3 * 24 * 60 * 60;

export interface ReminderRunResult {
  date: string;
  dueAnniversaries: number;
  recipients: number;
  sent: number;
  alreadySent: number;
  failed: number;
}

/**
 * Job hằng ngày (lịch QStash, xem scripts/setup-qstash-schedules.ts) gửi email
 * nhắc ngày giỗ. Quy tắc chọn người nhận / ngày nhắc: anniversary-reminder.ts.
 *
 * Chạy lại an toàn: QStash retry khi job lỗi, nên mỗi (ngày, tài khoản) được
 * "giữ chỗ" bằng SET NX trên Redis TRƯỚC khi gửi — lần retry bỏ qua người đã
 * nhận, chỉ gửi lại cho người lỗi (khoá của họ bị xoá khi gửi hỏng).
 */
@Injectable()
export class AnniversaryReminderService {
  private readonly logger = new Logger(AnniversaryReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly supabaseUsers: SupabaseUsersService,
    @Inject('REDIS_CLIENT') private readonly redis: UpstashRedis,
  ) {}

  async sendDailyReminders(now = new Date()): Promise<ReminderRunResult> {
    const date = todayInVietnam(now);
    const result: ReminderRunResult = { date, dueAnniversaries: 0, recipients: 0, sent: 0, alreadySent: 0, failed: 0 };

    if (!this.mail.isConfigured()) {
      // Không ném: retry không làm env tự xuất hiện.
      this.logger.error('Không gửi được nhắc ngày giỗ: thiếu RESEND_API_KEY/MAIL_FROM');
      return result;
    }

    const today = parseIsoDay(date);
    const due = (await this.prisma.anniversary.findMany({ include: ANNIVERSARY_INCLUDE }))
      .map((row) => toAnniversaryDto(row, today))
      .filter((a) => (REMINDER_DAYS_BEFORE as readonly number[]).includes(a.daysUntil));
    result.dueAnniversaries = due.length;
    if (!due.length) return result;

    const [recipients, edges] = await Promise.all([
      this.prisma.userMetadata.findMany({
        where: {
          profile_member_id: { not: null },
          deactivated_at: null,
          anniversary_reminders: true,
          roles: { hasSome: RECIPIENT_ROLES },
        },
        select: { user_id: true, profile_member_id: true, profile_member: { select: { name: true } } },
      }),
      this.prisma.memberRelationship.findMany({ select: { parent_id: true, child_id: true, type: true } }),
    ]);

    const plans = recipients
      .map((r) => ({ ...r, items: remindersFor(due, relativesToRemember(r.profile_member_id!, edges)) }))
      .filter((p) => p.items.length);
    result.recipients = plans.length;
    if (!plans.length) return result;

    const emails = await this.supabaseUsers.getEmails(plans.map((p) => p.user_id));
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');

    for (const plan of plans) {
      const to = emails.get(plan.user_id);
      if (!to) {
        this.logger.warn(`Tài khoản ${plan.user_id} không có email — bỏ qua nhắc ngày giỗ`);
        continue;
      }

      const key = `reminder:anniversary:${date}:${plan.user_id}`;
      if (!(await this.claim(key))) {
        result.alreadySent++;
        continue;
      }

      try {
        await this.mail.send(
          buildAnniversaryReminderEmail({
            to,
            recipientName: plan.profile_member?.name ?? null,
            items: plan.items,
            calendarUrl: `${frontendUrl}/anniversaries`,
            unsubscribeUrl: unsubscribeUrlFor(plan.user_id),
          }),
        );
        result.sent++;
      } catch (err) {
        result.failed++;
        this.logger.error(`Gửi nhắc ngày giỗ cho ${plan.user_id} lỗi: ${(err as Error).message}`);
        await this.release(key);
      }
    }

    this.logger.log(`Nhắc ngày giỗ ${date}: ${JSON.stringify(result)}`);
    // Ném SAU khi đã thử hết mọi người để QStash retry — khoá "đã gửi" đảm bảo
    // lần retry chỉ gửi cho những người vừa lỗi.
    if (result.failed) throw new Error(`${result.failed} email nhắc ngày giỗ gửi lỗi`);
    return result;
  }

  /** true = được gửi. Redis lỗi ⇒ vẫn gửi: trùng một thư tốt hơn là mất cả lượt. */
  private async claim(key: string): Promise<boolean> {
    try {
      return (await this.redis.set(key, '1', { nx: true, ex: SENT_KEY_TTL_SECONDS })) === 'OK';
    } catch (err) {
      this.logger.warn(`Redis lỗi khi giữ chỗ ${key}, vẫn gửi: ${(err as Error).message}`);
      return true;
    }
  }

  private async release(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {
      // Mất khoá thì lần retry bỏ qua người này — chấp nhận, đã log lỗi gửi ở trên.
    }
  }
}

export function unsubscribeUrlFor(userId: string): string | null {
  const token = createUnsubscribeToken(userId);
  if (!token) return null;
  let appUrl = process.env.APP_URL || 'http://localhost:3002';
  if (!/^https?:\/\//i.test(appUrl)) appUrl = `https://${appUrl}`;
  return `${appUrl.replace(/\/$/, '')}/v2/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
}

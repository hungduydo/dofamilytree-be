import type { MailMessage } from '../mail/mail.service';
import { escapeHtml } from '../mail/escape-html';
import { parseIsoDay } from '../events/anniversary-occurrence';
import { solarToLunar } from '../utils/lunar-calendar';

/**
 * Nhắc ngày giỗ qua email — phần THUẦN (chọn ngày nào nhắc ai, dựng nội dung).
 * Phần đọc DB / gửi thư nằm ở AnniversaryReminderService.
 *
 * AI NHẬN GÌ — quyết định sản phẩm quan trọng nhất của tính năng này:
 * dòng họ có ~200 ngày kỵ/năm. Nhắc mọi ngày kỵ cho mọi người nghĩa là gần như
 * ngày nào cũng có thư ⇒ người ta tắt, hoặc tệ hơn, đánh dấu spam và thư của
 * cả domain vào Spam. Nên mỗi người chỉ nhận:
 *   - ngày kỵ của TỔ TIÊN TRỰC HỆ (cha mẹ, ông bà, cụ kỵ… ruột hoặc nuôi) và
 *     của VỢ/CHỒNG — những ngày họ thật sự phải về cúng;
 *   - các ngày CHUNG của dòng họ (giỗ tổ, thanh minh… — không gắn member nào).
 */

/** Nhắc khi còn đúng bấy nhiêu ngày: một tuần để thu xếp về quê, và hôm trước. */
export const REMINDER_DAYS_BEFORE = [7, 1] as const;

/** Chỉ các field của AnniversaryResponseDto mà email cần. */
export interface ReminderAnniversary {
  id: string;
  kind: string;
  calendar: string;
  day: number;
  month: number;
  isLeapMonth: boolean;
  displayTitle: string;
  member_id: string | null;
  nextOccurrence: string;
  daysUntil: number;
  yearsSinceDeath: number | null;
  cemetery: { name: string } | null;
}

export interface ParentEdge {
  parent_id: string;
  child_id: string;
  type: string;
}

/**
 * Tổ tiên trực hệ (mọi đời, qua BIOLOGICAL + ADOPTED) và vợ/chồng của một
 * member. Có chặn vòng: dữ liệu nhập tay có thể lỡ tạo chu trình cha–con.
 */
export function relativesToRemember(memberId: string, edges: ParentEdge[]): Set<string> {
  const parentsOf = new Map<string, string[]>();
  const spouses = new Set<string>();
  for (const e of edges) {
    if (e.type === 'SPOUSE') {
      if (e.parent_id === memberId) spouses.add(e.child_id);
      if (e.child_id === memberId) spouses.add(e.parent_id);
      continue;
    }
    const list = parentsOf.get(e.child_id) ?? [];
    list.push(e.parent_id);
    parentsOf.set(e.child_id, list);
  }

  const out = new Set<string>(spouses);
  const queue = [...(parentsOf.get(memberId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.has(id) || id === memberId) continue;
    out.add(id);
    queue.push(...(parentsOf.get(id) ?? []));
  }
  return out;
}

/** Ngày nào trong danh sách "sắp tới" cần nhắc cho một người cụ thể. */
export function remindersFor<T extends ReminderAnniversary>(
  upcoming: T[],
  relatives: Set<string>,
): T[] {
  return upcoming.filter((a) => (a.member_id ? relatives.has(a.member_id) : a.kind !== 'DEATH'));
}

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** 'YYYY-MM-DD' → "Thứ Hai, 06/10/2026". */
export function formatSolarDay(iso: string): string {
  const d = parseIsoDay(iso);
  const weekday = WEEKDAYS[new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${weekday}, ${pad(d.day)}/${pad(d.month)}/${d.year}`;
}

/**
 * Ngày âm của CHÍNH lần sắp tới (không phải ngày lưu trong DB): người mất ngày
 * 30 tháng thiếu được cúng ngày 29, và người đọc cần biết đúng ngày sẽ cúng.
 */
export function formatLunarDay(iso: string): string {
  const d = parseIsoDay(iso);
  const lunar = solarToLunar(d.day, d.month, d.year);
  const day = lunar.day <= 10 ? `mùng ${lunar.day}` : String(lunar.day);
  return `${day} tháng ${lunar.month}${lunar.isLeapMonth ? ' nhuận' : ''} âm lịch`;
}

function whenLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'hôm nay';
  if (daysUntil === 1) return 'ngày mai';
  return `còn ${daysUntil} ngày`;
}

export interface ReminderEmailInput {
  to: string;
  recipientName: string | null;
  items: ReminderAnniversary[];
  /** Trang lịch ngày giỗ trên web. */
  calendarUrl: string;
  /** Link tắt nhắc (trang xác nhận). null = không dựng được (thiếu secret). */
  unsubscribeUrl: string | null;
}

export function buildAnniversaryReminderEmail(input: ReminderEmailInput): MailMessage {
  const items = [...input.items].sort(
    (a, b) => a.daysUntil - b.daysUntil || a.displayTitle.localeCompare(b.displayTitle, 'vi'),
  );
  const first = items[0];
  const subject =
    items.length === 1
      ? `Nhắc ngày giỗ: ${first.displayTitle} — ${whenLabel(first.daysUntil)}`
      : `Nhắc ngày giỗ: ${items.length} ngày giỗ sắp tới trong gia đình`;

  const lines = items.map((a) => {
    const parts = [
      `${a.displayTitle} — ${whenLabel(a.daysUntil)}`,
      `  ${formatSolarDay(a.nextOccurrence)}` +
        (a.calendar === 'LUNAR' ? ` (${formatLunarDay(a.nextOccurrence)})` : ''),
    ];
    if (a.yearsSinceDeath) parts.push(`  Tròn ${a.yearsSinceDeath} năm ngày mất`);
    if (a.cemetery?.name) parts.push(`  Mộ phần: ${a.cemetery.name}`);
    return parts.join('\n');
  });

  const greeting = input.recipientName ? `Kính gửi ${input.recipientName},` : 'Kính gửi quý thành viên,';
  const footer = input.unsubscribeUrl
    ? `Bạn nhận thư này vì đã bật nhắc ngày giỗ. Tắt nhắc: ${input.unsubscribeUrl}`
    : 'Bạn nhận thư này vì đã bật nhắc ngày giỗ trong tài khoản gia phả.';

  const text = [
    greeting,
    '',
    'Gia phả xin nhắc các ngày giỗ sắp tới trong gia đình:',
    '',
    lines.join('\n\n'),
    '',
    `Xem lịch ngày giỗ: ${input.calendarUrl}`,
    '',
    footer,
  ].join('\n');

  const e = escapeHtml;
  const htmlItems = items
    .map((a) => {
      const lunar = a.calendar === 'LUNAR' ? ` <span style="color:#6b5b4b">(${e(formatLunarDay(a.nextOccurrence))})</span>` : '';
      const extra = [
        a.yearsSinceDeath ? `Tròn ${a.yearsSinceDeath} năm ngày mất` : null,
        a.cemetery?.name ? `Mộ phần: ${e(a.cemetery.name)}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return `<li style="margin:0 0 14px">
  <strong>${e(a.displayTitle)}</strong> — <em>${e(whenLabel(a.daysUntil))}</em><br>
  ${e(formatSolarDay(a.nextOccurrence))}${lunar}${extra ? `<br><span style="color:#6b5b4b">${extra}</span>` : ''}
</li>`;
    })
    .join('\n');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2b2118;max-width:560px">
<p>${e(greeting)}</p>
<p>Gia phả xin nhắc các ngày giỗ sắp tới trong gia đình:</p>
<ul style="padding-left:20px">
${htmlItems}
</ul>
<p><a href="${e(input.calendarUrl)}">Xem lịch ngày giỗ</a></p>
<hr style="border:none;border-top:1px solid #e6ddd3;margin:24px 0 12px">
<p style="font-size:12px;color:#8a7b6c">${
    input.unsubscribeUrl
      ? `Bạn nhận thư này vì đã bật nhắc ngày giỗ. <a href="${e(input.unsubscribeUrl)}" style="color:#8a7b6c">Tắt nhắc ngày giỗ</a>.`
      : 'Bạn nhận thư này vì đã bật nhắc ngày giỗ trong tài khoản gia phả.'
  }</p>
</div>`;

  return {
    to: [input.to],
    subject,
    text,
    html,
    ...(input.unsubscribeUrl && {
      headers: {
        'List-Unsubscribe': `<${input.unsubscribeUrl}>`,
        // RFC 8058: bấm "Huỷ đăng ký" trong Gmail gửi POST tới URL trên.
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  };
}

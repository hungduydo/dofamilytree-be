import type { MailMessage } from '../mail/mail.service';
import { escapeHtml } from '../mail/escape-html';

/** Những gì người đăng ký tự khai — cùng shape với `user_metadata.claim_request`. */
export type ClaimRequest = {
  fullName?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  generation?: number | null;
  occupation?: string | null;
  address?: string | null;
  biography?: string | null;
  submittedAt?: string | null;
};

export type PendingAccountEmailInput = {
  to: string[];
  registrantEmail: string | null;
  claim: ClaimRequest;
  /** Số tài khoản đang chờ, TÍNH CẢ tài khoản này. */
  pendingCount: number;
  /** Trang duyệt trong back office — `/bo/users` mặc định lọc `pending`. */
  reviewUrl: string;
};

const GENDER_LABEL: Record<string, string> = { male: 'Nam', female: 'Nữ', other: 'Khác' };
const BIOGRAPHY_LIMIT = 300;

function formatSubmittedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
}

/** Chỉ các dòng có giá trị — field bỏ trống thì không in, không bịa "Không rõ". */
function claimRows(input: PendingAccountEmailInput): Array<[string, string]> {
  const { claim, registrantEmail } = input;
  const biography = claim.biography?.trim();
  const rows: Array<[string, string | null | undefined]> = [
    ['Họ tên', claim.fullName?.trim()],
    ['Email', registrantEmail],
    ['Giới tính', claim.gender ? (GENDER_LABEL[claim.gender] ?? claim.gender) : null],
    ['Ngày sinh', claim.birthDate],
    ['Ngày mất', claim.deathDate],
    ['Đời thứ', claim.generation != null ? String(claim.generation) : null],
    ['Nghề nghiệp', claim.occupation],
    ['Địa chỉ', claim.address],
    [
      'Tiểu sử',
      biography && biography.length > BIOGRAPHY_LIMIT
        ? `${biography.slice(0, BIOGRAPHY_LIMIT)}…`
        : biography,
    ],
    ['Gửi lúc', formatSubmittedAt(claim.submittedAt)],
  ];
  return rows.filter((row): row is [string, string] => Boolean(row[1] && String(row[1]).trim()));
}

export function buildPendingAccountEmail(input: PendingAccountEmailInput): MailMessage {
  const name = input.claim.fullName?.trim() || input.registrantEmail || 'Một người';
  const rows = claimRows(input);
  const others = input.pendingCount - 1;
  const queueLine =
    others > 0
      ? `Hàng đợi hiện có ${input.pendingCount} tài khoản chờ duyệt (gồm cả tài khoản này).`
      : 'Đây là tài khoản duy nhất đang chờ duyệt.';

  const subject = `[Gia Phả] Tài khoản mới chờ duyệt: ${name}`;

  const text = [
    `${name} vừa đăng ký tài khoản và đang chờ được gắn vào một thành viên trong cây gia phả.`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    queueLine,
    `Duyệt tại: ${input.reviewUrl}`,
    '',
    'Bạn nhận email này vì tài khoản của bạn có quyền quản trị (admin).',
  ].join('\n');

  const rowsHtml = rows
    .map(
      ([label, value]) => `
                  <tr>
                    <td style="padding:6px 12px 6px 0; font-size:13px; color:#8a8a8a; white-space:nowrap; vertical-align:top;">${escapeHtml(label)}</td>
                    <td style="padding:6px 0; font-size:14px; color:#2b2b2b; word-break:break-word;">${escapeHtml(value)}</td>
                  </tr>`,
    )
    .join('');

  const url = escapeHtml(input.reviewUrl);

  const html = `<!DOCTYPE html>
<html lang="vi">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0; padding:0; background-color:#f4f2ee; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f2ee;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background-color:#ffffff; border-radius:16px; overflow:hidden;">
            <tr>
              <td align="center" style="background-color:#7c5c3e; padding:24px;">
                <div style="font-size:20px; font-weight:700; color:#ffffff;">🌳 Gia Phả</div>
                <div style="font-size:13px; color:#e8ddd0; margin-top:4px;">Tài khoản mới chờ duyệt</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#4a4a4a;">
                  <strong>${escapeHtml(name)}</strong> vừa đăng ký tài khoản và đang chờ được gắn vào một thành viên trong cây gia phả.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:0 0 20px 0; border-top:1px solid #eeeae4; border-bottom:1px solid #eeeae4;">${rowsHtml}
                </table>
                <p style="margin:0 0 20px 0; font-size:14px; line-height:1.6; color:#4a4a4a;">${escapeHtml(queueLine)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px auto;">
                  <tr>
                    <td align="center" style="border-radius:10px; background-color:#7c5c3e;">
                      <a href="${url}" style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none;">Mở hàng đợi duyệt</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 24px 0; font-size:13px; line-height:1.6; word-break:break-all;">
                  <a href="${url}" style="color:#7c5c3e;">${url}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 28px 32px;">
                <p style="margin:0; font-size:12px; color:#a8a8a8; line-height:1.6;">
                  Bạn nhận email này vì tài khoản của bạn có quyền quản trị (admin).<br />Đây là email tự động, vui lòng không trả lời.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { to: input.to, subject, text, html };
}

import { createHash, randomBytes } from 'crypto';

/**
 * Hằng số + helper cho Contact. Mọi con số ở đây là BẢN SAO của
 * `frontend/src/lib/contactView.ts` — FE chặn trước bằng đúng những giá trị
 * này, lệch một con số là người dùng gõ xong mới ăn 400. Sửa một bên PHẢI sửa
 * bên kia.
 */

// ─── Chủ đề ───────────────────────────────────────────────────────────────────

/**
 * Thư gửi về việc gì. GIÁ TRỊ là hợp đồng với FE; NHÃN hiển thị được dịch phía
 * FE (`ContactPage.topic<VALUE>`) và KHÔNG BAO GIỜ gửi qua API — hai catalogue
 * dịch thuật phải là nơi duy nhất chứa câu chữ.
 *
 * Enum chứ không phải free text để ban liên lạc phân loại được thư mà chưa cần
 * mở ra đọc.
 */
export const CONTACT_TOPICS = ['GENEALOGY', 'GRAVE', 'EVENT', 'SCHOLARSHIP', 'OTHER'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

/** Vòng đời một lá thư trong hộp thư ban liên lạc. */
export const CONTACT_STATUSES = ['NEW', 'IN_PROGRESS', 'ANSWERED', 'SPAM'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

// ─── Biên độ nội dung ────────────────────────────────────────────────────────

export const CONTACT_NAME_MIN_LENGTH = 2;
export const CONTACT_NAME_MAX_LENGTH = 120;
export const CONTACT_BRANCH_MAX_LENGTH = 120;
export const CONTACT_CONTENT_MIN_LENGTH = 20;
export const CONTACT_CONTENT_MAX_LENGTH = 2000;

/**
 * Số điện thoại như người Việt THỰC SỰ gõ: mở đầu bằng 0 hoặc +84, rồi 8–13 ký
 * tự nữa gồm chữ số, khoảng trắng, dấu chấm hoặc gạch ngang.
 *
 * Lỏng một cách CỐ Ý, và phải giữ đúng bản sao của PHONE_PATTERN trong
 * contactView.ts: ban liên lạc thà nhận một số hơi lạ còn hơn mất hẳn lá thư.
 */
export const CONTACT_PHONE_PATTERN = /^(?:\+84|0)[\d\s.-]{8,13}$/;

// ─── Tệp đính kèm ────────────────────────────────────────────────────────────

export const CONTACT_ATTACHMENTS_MAX = 3;

/**
 * 4,5 MB — KHÔNG phải 10 MB như chú thích trên mockup.
 *
 * Vercel chặn request body ở tầng platform TRƯỚC khi tới NestJS (4.5MB khi
 * project chưa bật Fluid Compute). Hứa 10 MB là hứa một điều platform sẽ bẻ
 * gãy bằng 413 của CHÍNH NÓ — client nhận lỗi không có message tiếng Việt của
 * ta. Con số này khớp MAX_UPLOAD_BYTES trong frontend/src/lib/apiClient.ts.
 *
 * Media dùng con số RỘNG HƠN NHIỀU (MEDIA_MAX_UPLOAD_BYTES, mặc định 50MB) vì
 * nó có đường presigned PUT thẳng lên storage cho file lớn. Contact KHÔNG có
 * đường đó — form gửi một phát multipart — nên phải bám trần platform.
 */
export const CONTACT_ATTACHMENT_MAX_BYTES =
  Number(process.env.CONTACT_ATTACHMENT_MAX_BYTES) || 4.5 * 1024 * 1024;

/**
 * Trần cho TOÀN BỘ body, không chỉ từng file. Ba file 4,4 MB lọt qua kiểm tra
 * từng-file nhưng cộng lại vượt trần platform ⇒ vẫn 413. api-contact.md §3.2
 * yêu cầu chặn cả tổng.
 */
export const CONTACT_ATTACHMENTS_TOTAL_MAX_BYTES = CONTACT_ATTACHMENT_MAX_BYTES;

/**
 * Allowlist MIME. HẸP hơn nhiều so với media (ALLOWED_MIME_PREFIXES) và đó là
 * chủ ý: đây là endpoint ghi KHÔNG có guard, mở cho cả người chưa đăng ký. Ba
 * loại này là đúng những gì `CONTACT_ATTACHMENT_TYPES` bên FE cho chọn.
 */
export const CONTACT_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

export function isAllowedContactMime(mimetype?: string): boolean {
  return (CONTACT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mimetype ?? '');
}

/**
 * Key của file trên storage: `contact/<messageId>/<tên đã làm sạch>`.
 *
 * Cùng thủ pháp storageKeyFor() của media — tên file bị rút về [a-zA-Z0-9._-]
 * vì key nằm trong URL public: dấu tiếng Việt và khoảng trắng bị encode khác
 * nhau giữa nơi ghi và nơi đọc, sinh ra file "upload xong nhưng 404".
 */
export function contactStorageKey(messageId: string, filename: string): string {
  const safe = filename
    // Đ/đ PHẢI xử lý TRƯỚC NFD. NFD tách "ơ" thành o + dấu móc, nhưng Đ (U+0110)
    // là một ký tự nguyên khối chứ không phải D + dấu gạch, nên NFD không đụng
    // tới nó và bước lọc [^a-zA-Z0-9._-] phía dưới XOÁ HẲN nó. Thiếu dòng này
    // thì "Đơn xin bổ sung.pdf" thành "on-xin-bo-sung.pdf" — mất chữ cái đầu
    // của đúng cái từ hay gặp nhất trong tệp người nhà gửi lên.
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    // Cắt cả dấu chấm ở hai đầu, không chỉ gạch ngang: dấu `/` đã thành `-` nên
    // "../../etc/passwd" không leo ra ngoài được, nhưng một tên tệp đúng bằng
    // ".." vẫn sinh ra key "contact/<id>/.." — trỏ ngược lên thư mục cha.
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100);
  return `contact/${messageId}/${safe || 'file'}`;
}

// ─── Mã tham chiếu ───────────────────────────────────────────────────────────

/**
 * Bảng chữ base32 kiểu Crockford ĐÃ BỎ I, L, O, U.
 *
 * Người nhà ĐỌC MÃ NÀY QUA ĐIỆN THOẠI — đó là toàn bộ lý do nó tồn tại. I/1,
 * O/0 nghe và nhìn đều lẫn; U bị loại theo Crockford để không vô tình ghép
 * thành từ tục. 32 ký tự còn lại đủ để 4 vị trí cho ~1 triệu tổ hợp.
 */
const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REFERENCE_RANDOM_LENGTH = 4;

/**
 * `LH-<YYMM>-<4 ký tự base32>` — ví dụ "LH-2608-0431".
 *
 * NGẪU NHIÊN chứ KHÔNG PHẢI bộ đếm tăng dần: mã tuần tự cho bất kỳ ai gửi hai
 * lá thư biết được ban liên lạc nhận bao nhiêu thư ở giữa (api-contact.md §3.2).
 *
 * `randomBytes` chứ không phải Math.random: cùng lý do — mã đoán được thì đoán
 * được cả lưu lượng.
 *
 * Phần YYMM lấy theo GIỜ VIỆT NAM, không phải UTC. Vercel chạy UTC, nên sau 7h
 * sáng ngày 1 giờ VN mà lấy tháng UTC thì mã sinh ra vẫn mang tháng cũ và người
 * nhà đọc mã thấy lệch tháng so với ngày họ gửi.
 */
export function generateReferenceCode(now = new Date()): string {
  const vn = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: '2-digit',
    month: '2-digit',
  }).formatToParts(now);
  const year = vn.find((p) => p.type === 'year')?.value ?? '00';
  const month = vn.find((p) => p.type === 'month')?.value ?? '00';

  const bytes = randomBytes(REFERENCE_RANDOM_LENGTH);
  let suffix = '';
  for (const byte of bytes) suffix += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];

  return `LH-${year}${month}-${suffix}`;
}

/** Số lần sinh lại mã khi đụng UNIQUE. 4 ký tự base32 ⇒ đụng độ cực hiếm. */
export const REFERENCE_CODE_MAX_ATTEMPTS = 5;

// ─── Chống lạm dụng ──────────────────────────────────────────────────────────

/** api-contact.md §5: 3 thư / IP / giờ, 10 thư / IP / ngày. */
export const CONTACT_RATE_LIMITS = [
  { windowSeconds: 60 * 60, max: 3, label: 'giờ' },
  { windowSeconds: 24 * 60 * 60, max: 10, label: 'ngày' },
] as const;

/**
 * Băm IP để lưu và để làm khoá rate limit.
 *
 * Muối lấy từ env. KHÔNG có giá trị mặc định "an toàn" nào ở đây: thiếu muối
 * thì hash chỉ là sha256(ip) — một bảng tra ngược toàn bộ IPv4 dựng trong vài
 * phút, tức là ta vẫn đang lưu địa chỉ IP nhưng lại tưởng mình đã ẩn danh hoá.
 * Thiếu thì service log cảnh báo và KHÔNG lưu hash (xem ContactService).
 */
export function hashIp(ip: string, secret: string): string {
  return createHash('sha256').update(`${ip}${secret}`).digest('hex');
}

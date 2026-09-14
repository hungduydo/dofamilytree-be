import { Prisma } from '@prisma/client';

/**
 * Trạng thái sống/mất của một Member — nguồn sự thật duy nhất cho "đã khuất".
 *
 * Trước đây "đã khuất" được SUY từ `deathDate` (String tự do), mỗi nơi một kiểu:
 * thống kê đếm `not null` (tính cả chuỗi rỗng là đã mất), ban thờ lọc `<> ''`
 * (bỏ sót tổ tiên đã mất mà không rõ ngày). Giờ lưu tường minh ở
 * `members.life_status`; `deathDate` chỉ còn là thông tin phụ.
 *
 * UNKNOWN là giá trị hợp lệ, KHÔNG phải lỗi: dữ liệu gia phả thiếu thông tin là
 * bình thường, và "chưa rõ" trung thực hơn đoán bừa là còn sống.
 */
export const LIFE_STATUSES = ['ALIVE', 'DECEASED', 'UNKNOWN'] as const;
export type LifeStatus = (typeof LIFE_STATUSES)[number];

/**
 * Mọi query "người đã khuất" PHẢI dùng hằng này. Partial index
 * members_deceased_order_idx_v2 (008_member_life_status.sql) có mệnh đề WHERE
 * khớp CHÍNH XÁC — sửa một bên phải sửa bên kia.
 */
export const DECEASED_WHERE: Prisma.MemberWhereInput = { lifeStatus: 'DECEASED' };

/** Sống quá chừng này năm thì coi như đã mất. */
export const MAX_PLAUSIBLE_AGE = 110;

export function isLifeStatus(value: unknown): value is LifeStatus {
  return typeof value === 'string' && (LIFE_STATUSES as readonly string[]).includes(value);
}

/** Form v1 gửi `''` thay vì null cho "chưa nhập" — chuỗi rỗng/khoảng trắng KHÔNG phải ngày mất. */
export function hasRealDeathDate(deathDate?: string | null): boolean {
  return !!deathDate?.trim();
}

/** Năm từ birthDate tự do ("1990-01-01", "1850"...). null nếu không đọc được. */
export function parseBirthYear(birthDate?: string | null): number | null {
  const value = birthDate?.trim();
  if (!value) return null;
  const year = new Date(value).getFullYear();
  return Number.isNaN(year) ? null : year;
}

export interface LifeStatusInput {
  deathDate?: string | null;
  birthDate?: string | null;
  generation?: number | null;
}

export interface DeriveLifeStatusOptions {
  now?: Date;
  /**
   * Đời ≤ giá trị này ⇒ DECEASED. CHỈ dùng cho backfill một lần: `generation`
   * do job nền tính lại sau mỗi lần sửa quan hệ, không nên để nó âm thầm đổi
   * trạng thái sống/mất ở request path.
   */
  ancestorMaxGeneration?: number;
}

export type LifeStatusReason = 'deathDate' | 'generation' | 'age' | null;

/**
 * Suy trạng thái từ dữ liệu sẵn có. Chỉ trả DECEASED hoặc UNKNOWN — thiếu ngày
 * mất KHÔNG chứng minh được là còn sống, nên ALIVE luôn phải do người nhập.
 */
export function deriveLifeStatus(
  input: LifeStatusInput,
  options: DeriveLifeStatusOptions = {},
): { status: LifeStatus; reason: LifeStatusReason } {
  if (hasRealDeathDate(input.deathDate)) return { status: 'DECEASED', reason: 'deathDate' };

  const { ancestorMaxGeneration } = options;
  if (
    ancestorMaxGeneration !== undefined &&
    input.generation != null &&
    input.generation <= ancestorMaxGeneration
  ) {
    return { status: 'DECEASED', reason: 'generation' };
  }

  const birthYear = parseBirthYear(input.birthDate);
  const currentYear = (options.now ?? new Date()).getFullYear();
  if (birthYear !== null && currentYear - birthYear > MAX_PLAUSIBLE_AGE) {
    return { status: 'DECEASED', reason: 'age' };
  }

  return { status: 'UNKNOWN', reason: null };
}

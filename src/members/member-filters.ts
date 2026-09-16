import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LifeStatus, isLifeStatus } from './life-status';

/**
 * Bộ lọc "thiếu dữ liệu" cho bảng BO — để ban quản trị tìm những hồ sơ cần
 * bổ sung. Giá trị đến từ query string `?missing=birthDate,avatar`, chỉ những
 * khoá trong allowlist này mới đi tiếp (cùng cơ chế MEMBER_SORT_FIELDS).
 */
export const MEMBER_MISSING_FIELDS = ['birthDate', 'avatar', 'parents', 'deathDate', 'deathAnniversary'] as const;
export type MemberMissingField = (typeof MEMBER_MISSING_FIELDS)[number];

/** Năm sinh hợp lệ cho bộ lọc khoảng — chặn số vô nghĩa trước khi xuống SQL. */
export const BIRTH_YEAR_MIN = 1000;
export const BIRTH_YEAR_MAX = 2200;

export interface MemberListFilters {
  lifeStatus?: LifeStatus;
  missing?: MemberMissingField[];
  birthYearFrom?: number;
  birthYearTo?: number;
}

/** `'birthDate,avatar,xyz'` → `['birthDate','avatar']`. Khoá lạ bị bỏ qua, không 400 (giống gender). */
export function parseMissingFields(raw?: string | string[]): MemberMissingField[] | undefined {
  if (raw === undefined) return undefined;
  const values = (Array.isArray(raw) ? raw : [raw])
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter((v): v is MemberMissingField => (MEMBER_MISSING_FIELDS as readonly string[]).includes(v));
  const unique = [...new Set(values)];
  return unique.length ? unique : undefined;
}

/**
 * Chuẩn hoá toàn bộ bộ lọc từ query string. Năm sinh ngoài khoảng hoặc
 * from > to ⇒ 400: đó là lỗi của người gọi, âm thầm trả rỗng chỉ khiến admin
 * tưởng dòng họ không có ai.
 */
export function buildMemberListFilters(query: {
  lifeStatus?: string;
  missing?: string | string[];
  birthYearFrom?: number;
  birthYearTo?: number;
}): MemberListFilters {
  const { birthYearFrom, birthYearTo } = query;
  for (const year of [birthYearFrom, birthYearTo]) {
    if (year !== undefined && (year < BIRTH_YEAR_MIN || year > BIRTH_YEAR_MAX)) {
      throw new BadRequestException(`Năm sinh phải nằm trong khoảng ${BIRTH_YEAR_MIN}–${BIRTH_YEAR_MAX}`);
    }
  }
  if (birthYearFrom !== undefined && birthYearTo !== undefined && birthYearFrom > birthYearTo) {
    throw new BadRequestException('birthYearFrom không được lớn hơn birthYearTo');
  }
  return {
    lifeStatus: isLifeStatus(query.lifeStatus) ? query.lifeStatus : undefined,
    missing: parseMissingFields(query.missing),
    birthYearFrom,
    birthYearTo,
  };
}

/** Cột String tự do: "thiếu" = null HOẶC chuỗi rỗng (form v1 gửi `''`). */
const blank = <K extends 'birthDate' | 'deathDate' | 'avatar_url'>(column: K): Prisma.MemberWhereInput => ({
  OR: [{ [column]: null }, { [column]: '' }],
});

export function missingFieldWhere(field: MemberMissingField): Prisma.MemberWhereInput {
  switch (field) {
    case 'birthDate':
      return blank('birthDate');
    case 'avatar':
      return blank('avatar_url');
    case 'parents':
      // child_relationships = các cạnh mà member này là CON. SPOUSE cũng lưu ở
      // bảng này nên phải loại ra, nếu không người có vợ/chồng sẽ bị coi là có cha mẹ.
      return { child_relationships: { none: { type: { not: 'SPOUSE' } } } };
    case 'deathDate':
      // Chỉ có nghĩa với người đã mất — người còn sống thiếu ngày mất là đúng.
      return { AND: [{ lifeStatus: 'DECEASED' }, blank('deathDate')] };
    case 'deathAnniversary':
      // Người đã mất chưa có ngày kỵ (anniversaries.kind = 'DEATH').
      return { lifeStatus: 'DECEASED', anniversaries: { none: { kind: 'DEATH' } } };
  }
}

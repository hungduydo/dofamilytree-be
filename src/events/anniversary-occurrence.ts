import {
  SolarDate,
  lunarAnniversaryInYear,
  solarAnniversaryInYear,
  solarToLunar,
} from '../utils/lunar-calendar';

export const ANNIVERSARY_KINDS = ['DEATH', 'CLAN', 'OTHER'] as const;
export type AnniversaryKind = (typeof ANNIVERSARY_KINDS)[number];

export const ANNIVERSARY_CALENDARS = ['LUNAR', 'SOLAR'] as const;
export type AnniversaryCalendar = (typeof ANNIVERSARY_CALENDARS)[number];

/** Cửa sổ tối đa cho GET /anniversaries/upcoming. */
export const UPCOMING_MAX_DAYS = 90;

export interface RecurringDate {
  calendar: string;
  day: number;
  month: number;
}

export interface Occurrence {
  /** Ngày dương, YYYY-MM-DD. */
  date: string;
  /** 0 = hôm nay. */
  daysUntil: number;
  /** Năm (âm hoặc dương, theo lịch của ngày kỵ) mà lần này thuộc về. */
  year: number;
}

const DAY_MS = 86_400_000;

function toUtc(d: SolarDate): number {
  return Date.UTC(d.year, d.month - 1, d.day);
}

function toIso(d: SolarDate): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** 'YYYY-MM-DD' → SolarDate. */
export function parseIsoDay(iso: string): SolarDate {
  const [year, month, day] = iso.split('-').map(Number);
  return { day, month, year };
}

export function occurrenceInYear(date: RecurringDate, year: number): SolarDate {
  return date.calendar === 'LUNAR'
    ? lunarAnniversaryInYear(date.day, date.month, year)
    : solarAnniversaryInYear(date.day, date.month, year);
}

/**
 * Lần gần nhất, tính cả hôm nay, mà ngày lặp lại này rơi vào — theo quy tắc ở
 * docs/product/lunar-calendar.md (tháng nhuận → tháng thường, 30 thiếu → 29).
 */
export function nextOccurrence(date: RecurringDate, today: SolarDate): Occurrence {
  // Mọi lần ≥ hôm nay đều thuộc năm (âm/dương) hiện tại hoặc năm sau.
  const year = date.calendar === 'LUNAR' ? solarToLunar(today.day, today.month, today.year).year : today.year;
  const start = toUtc(today);
  for (const y of [year, year + 1]) {
    const solar = occurrenceInYear(date, y);
    const diff = Math.round((toUtc(solar) - start) / DAY_MS);
    if (diff >= 0) return { date: toIso(solar), daysUntil: diff, year: y };
  }
  // Không thể xảy ra: năm sau luôn sau hôm nay.
  throw new Error('nextOccurrence: không tìm được lần kế tiếp');
}

/** Lỗi nghiệp vụ của một ngày lặp lại, hoặc null nếu hợp lệ. */
export function recurringDateError(input: {
  calendar: string;
  day: number;
  month: number;
  isLeapMonth: boolean;
}): string | null {
  const { calendar, day, month, isLeapMonth } = input;
  if (!(ANNIVERSARY_CALENDARS as readonly string[]).includes(calendar)) return 'calendar không hợp lệ';
  if (!Number.isInteger(month) || month < 1 || month > 12) return 'Tháng phải từ 1 đến 12';
  if (calendar === 'LUNAR') {
    if (!Number.isInteger(day) || day < 1 || day > 30) return 'Ngày âm lịch phải từ 1 đến 30';
    return null;
  }
  if (isLeapMonth) return 'Chỉ ngày âm lịch mới có tháng nhuận';
  // 2024 là năm nhuận nên 29/2 hợp lệ.
  const last = new Date(Date.UTC(2024, month, 0)).getUTCDate();
  if (!Number.isInteger(day) || day < 1 || day > last) return `Tháng ${month} chỉ có ${last} ngày`;
  return null;
}

/**
 * Đọc ngày kỵ âm lịch từ tiểu sử gia phả nhập khẩu: "Kỵ: 23.12 Âm lịch", "Kỵ: 5/3 âm lịch",
 * "Kỵ: 10.4 nhuận Âm lịch". Cùng mẫu với scripts/restore-from-import-json.ts.
 * Trả `null` nếu không có dòng "Kỵ:" nào đọc được, hoặc ngày/tháng ngoài khoảng.
 */
export function parseDeathAnniversaryNote(
  text: string | null | undefined,
): { day: number; month: number; isLeapMonth: boolean } | null {
  const match = text?.match(/Kỵ:\s*(\d{1,2})\s*[./]\s*(\d{1,2})\s*(nhuận\s*)?Âm lịch/i);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const isLeapMonth = !!match[3];
  if (recurringDateError({ calendar: 'LUNAR', day, month, isLeapMonth })) return null;
  return { day, month, isLeapMonth };
}

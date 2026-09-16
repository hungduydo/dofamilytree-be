/**
 * Âm lịch Việt Nam — thuật toán của Hồ Ngọc Đức (https://www.informatik.uni-leipzig.de/~duc/amlich/),
 * tính theo múi giờ UTC+7.
 *
 * KHÔNG dùng thư viện âm lịch Trung Quốc (UTC+8): hai lịch lệch nhau ở một số năm — Tết Ất Sửu
 * ở Việt Nam là 21/01/1985, ở Trung Quốc là 20/02/1985.
 *
 * File này có bản sao Y HỆT ở `frontend/src/lib/lunarCalendar.ts` (hai repo không chia sẻ code).
 * Sửa một bên phải sửa bên kia; bộ test vector ở hai bên cũng giống nhau.
 *
 * Quy tắc quy đổi ngày kỵ: docs/product/lunar-calendar.md (repo dofamilytree).
 */

export interface SolarDate {
  day: number;
  month: number;
  year: number;
}

export interface LunarDate {
  day: number;
  month: number;
  year: number;
  isLeapMonth: boolean;
}

const TIME_ZONE = 7;
const INT = Math.floor;

function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) {
    jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  }
  return jd;
}

function jdToDate(jd: number): SolarDate {
  let b: number;
  let c: number;
  if (jd > 2299160) {
    const a = jd + 32044;
    b = INT((4 * a + 3) / 146097);
    c = a - INT((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = INT((4 * c + 3) / 1461);
  const e = c - INT((1461 * d) / 4);
  const m = INT((5 * e + 2) / 153);
  return {
    day: e - INT((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * INT(m / 10),
    year: b * 100 + d - 4800 + INT(m / 10),
  };
}

function newMoon(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = Math.PI / 180;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltat =
    T < -11
      ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return jd1 + C1 - deltat;
}

function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T;
  const dr = Math.PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L -= Math.PI * 2 * INT(L / (Math.PI * 2));
  return L;
}

function getNewMoonDay(k: number): number {
  return INT(newMoon(k) + 0.5 + TIME_ZONE / 24);
}

function getSunLongitude(jdn: number): number {
  return INT((sunLongitude(jdn - 0.5 - TIME_ZONE / 24) / Math.PI) * 6);
}

/** Ngày (JD) bắt đầu tháng 11 âm của năm dương `yy`. */
function getLunarMonth11(yy: number): number {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  const nm = getNewMoonDay(k);
  return getSunLongitude(nm) >= 9 ? getNewMoonDay(k - 1) : nm;
}

/** Vị trí tháng nhuận, tính từ tháng 11 âm `a11` (1 = tháng ngay sau tháng 11). */
function getLeapMonthOffset(a11: number): number {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last: number;
  let i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i));
  do {
    last = arc;
    i++;
    arc = getSunLongitude(getNewMoonDay(k + i));
  } while (arc !== last && i < 14);
  return i - 1;
}

/** Offset tháng nhuận → số tháng âm (1–12). Offset 1 là "tháng 11 nhuận". */
function leapOffsetToMonth(leapOff: number): number {
  return ((leapOff + 9) % 12) + 1;
}

export function solarToLunar(day: number, month: number, year: number): LunarDate {
  const dayNumber = jdFromDate(day, month, year);
  // Bản gốc chỉ thử k và k+1; ước lượng k đôi khi lệch một (vd 07/05/2054 ra "ngày 0"),
  // nên dò tới khi trăng mới k là lần gần nhất không sau `dayNumber`.
  let k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  while (getNewMoonDay(k) > dayNumber) k--;
  while (getNewMoonDay(k + 1) <= dayNumber) k++;
  const monthStart = getNewMoonDay(k);

  let a11 = getLunarMonth11(year);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = year;
    a11 = getLunarMonth11(year - 1);
  } else {
    lunarYear = year + 1;
    b11 = getLunarMonth11(year + 1);
  }

  const lunarDay = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11) / 29);
  let isLeapMonth = false;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) isLeapMonth = true;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;

  return { day: lunarDay, month: lunarMonth, year: lunarYear, isLeapMonth };
}

/**
 * Ngày âm → ngày dương. Trả `null` nếu ngày âm không tồn tại (tháng nhuận không có
 * trong năm đó, hoặc ngày 30 ở tháng thiếu).
 */
export function lunarToSolar(
  day: number,
  month: number,
  year: number,
  isLeapMonth = false,
): SolarDate | null {
  if (!Number.isInteger(day) || day < 1 || day > 30) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;

  let a11: number;
  let b11: number;
  if (month < 11) {
    a11 = getLunarMonth11(year - 1);
    b11 = getLunarMonth11(year);
  } else {
    a11 = getLunarMonth11(year);
    b11 = getLunarMonth11(year + 1);
  }
  const k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  let off = month - 11;
  if (off < 0) off += 12;

  if (b11 - a11 > 365) {
    const leapOff = getLeapMonthOffset(a11);
    if (isLeapMonth && month !== leapOffsetToMonth(leapOff)) return null;
    if (isLeapMonth || off >= leapOff) off += 1;
  } else if (isLeapMonth) {
    return null;
  }

  const jd = getNewMoonDay(k + off) + day - 1;
  const result = jdToDate(jd);
  // Ngày 30 của tháng thiếu sẽ tràn sang mùng 1 tháng sau — coi là không tồn tại.
  const back = solarToLunar(result.day, result.month, result.year);
  if (back.day !== day || back.month !== month || back.isLeapMonth !== isLeapMonth) return null;
  return result;
}

/** Tháng nhuận của năm âm `year` (1–12), hoặc 0 nếu năm không nhuận. */
export function leapMonthOf(year: number): number {
  for (let month = 1; month <= 12; month++) {
    if (lunarToSolar(1, month, year, true)) return month;
  }
  return 0;
}

/** Số ngày của tháng âm (29 hoặc 30); 0 nếu tháng không tồn tại. */
export function lunarMonthLength(month: number, year: number, isLeapMonth = false): number {
  if (!lunarToSolar(1, month, year, isLeapMonth)) return 0;
  return lunarToSolar(30, month, year, isLeapMonth) ? 30 : 29;
}

/**
 * Ngày dương của một ngày kỵ âm lịch trong năm âm `year`, theo tập quán:
 *  - mất vào tháng nhuận → cúng vào tháng thường cùng số;
 *  - mất ngày 30 mà năm nay tháng đó thiếu → cúng ngày 29 (ngày cuối tháng).
 */
export function lunarAnniversaryInYear(day: number, month: number, year: number): SolarDate {
  const length = lunarMonthLength(month, year, false);
  const result = lunarToSolar(Math.min(day, length), month, year, false);
  if (!result) throw new RangeError(`Ngày âm không hợp lệ: ${day}/${month}/${year}`);
  return result;
}

/** Ngày dương lặp lại hằng năm; 29/2 rơi vào năm không nhuận → 28/2. */
export function solarAnniversaryInYear(day: number, month: number, year: number): SolarDate {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { day: Math.min(day, last), month, year };
}

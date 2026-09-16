import {
  leapMonthOf,
  lunarAnniversaryInYear,
  lunarMonthLength,
  lunarToSolar,
  solarAnniversaryInYear,
  solarToLunar,
} from '../../src/utils/lunar-calendar';

// Bộ vector này có bản sao y hệt ở frontend/src/lib/__tests__/lunarCalendar.test.ts.
describe('lunar-calendar', () => {
  it.each([
    // [dương d, m, y] → [âm d, m, y, nhuận]
    [[21, 1, 1985], [1, 1, 1985, false]], // Tết Ất Sửu — lịch VN, khác lịch TQ (20/02)
    [[29, 1, 2025], [1, 1, 2025, false]], // Tết Ất Tỵ
    [[17, 2, 2026], [1, 1, 2026, false]], // Tết Bính Ngọ
    [[6, 10, 2025], [15, 8, 2025, false]], // Trung thu 2025
    [[25, 9, 2026], [15, 8, 2026, false]], // Trung thu 2026
    [[25, 7, 2025], [1, 6, 2025, true]], // mùng 1 tháng 6 nhuận Ất Tỵ
    [[22, 3, 2023], [1, 2, 2023, true]], // mùng 1 tháng 2 nhuận Quý Mão
    [[16, 2, 2026], [29, 12, 2025, false]], // giao thừa: cuối tháng Chạp năm trước
  ])('solarToLunar(%j) = %j', ([d, m, y], [ld, lm, ly, leap]) => {
    expect(solarToLunar(d as number, m as number, y as number)).toEqual({
      day: ld, month: lm, year: ly, isLeapMonth: leap,
    });
  });

  it('lunarToSolar là nghịch đảo của solarToLunar cho mọi ngày 1990–2060', () => {
    for (let t = Date.UTC(1990, 0, 1); t <= Date.UTC(2060, 11, 31); t += 86_400_000) {
      const d = new Date(t);
      const solar = { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
      const lunar = solarToLunar(solar.day, solar.month, solar.year);
      expect(lunarToSolar(lunar.day, lunar.month, lunar.year, lunar.isLeapMonth)).toEqual(solar);
    }
  });

  it('biết tháng nhuận của từng năm', () => {
    expect(leapMonthOf(2020)).toBe(4);
    expect(leapMonthOf(2023)).toBe(2);
    expect(leapMonthOf(2025)).toBe(6);
    expect(leapMonthOf(2026)).toBe(0);
  });

  it('từ chối ngày âm không tồn tại', () => {
    expect(lunarToSolar(1, 5, 2026, true)).toBeNull(); // 2026 không nhuận
    expect(lunarToSolar(1, 3, 2025, true)).toBeNull(); // 2025 nhuận tháng 6, không phải 3
    expect(lunarToSolar(31, 1, 2026)).toBeNull();
    expect(lunarToSolar(1, 13, 2026)).toBeNull();
    const shortMonth = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((m) => lunarMonthLength(m, 2026) === 29)!;
    expect(lunarToSolar(30, shortMonth, 2026)).toBeNull();
  });

  describe('lunarAnniversaryInYear', () => {
    it('quy đổi ngày kỵ thường', () => {
      expect(lunarAnniversaryInYear(15, 8, 2026)).toEqual({ day: 25, month: 9, year: 2026 });
    });

    it('ngày 30 ở tháng thiếu → ngày 29', () => {
      const shortMonth = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((m) => lunarMonthLength(m, 2026) === 29)!;
      expect(lunarAnniversaryInYear(30, shortMonth, 2026)).toEqual(lunarToSolar(29, shortMonth, 2026));
    });

    it('luôn dùng tháng thường, kể cả năm có tháng nhuận cùng số', () => {
      expect(lunarAnniversaryInYear(10, 6, 2025)).toEqual(lunarToSolar(10, 6, 2025, false));
    });
  });

  it('solarAnniversaryInYear: 29/2 → 28/2 ở năm không nhuận', () => {
    expect(solarAnniversaryInYear(29, 2, 2026)).toEqual({ day: 28, month: 2, year: 2026 });
    expect(solarAnniversaryInYear(29, 2, 2028)).toEqual({ day: 29, month: 2, year: 2028 });
  });
});

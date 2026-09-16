import {
  nextOccurrence,
  parseDeathAnniversaryNote,
  recurringDateError,
} from '../../src/events/anniversary-occurrence';

const today = { day: 16, month: 9, year: 2026 }; // mùng 6/8 âm Bính Ngọ

describe('nextOccurrence', () => {
  it('kỵ âm lịch trong năm nay', () => {
    expect(nextOccurrence({ calendar: 'LUNAR', day: 15, month: 8 }, today))
      .toEqual({ date: '2026-09-25', daysUntil: 9, year: 2026 });
  });

  it('kỵ tháng Chạp rơi vào đầu năm dương sau nhưng vẫn thuộc năm âm này', () => {
    const next = nextOccurrence({ calendar: 'LUNAR', day: 23, month: 12 }, today);
    expect(next.year).toBe(2026);
    expect(next.date.startsWith('2027-')).toBe(true);
  });

  it('trước Tết: năm âm hiện tại vẫn là năm cũ', () => {
    // 10/02/2026 là 23/12 âm Ất Tỵ (Tết Bính Ngọ 17/02/2026)
    expect(nextOccurrence({ calendar: 'LUNAR', day: 23, month: 12 }, { day: 10, month: 2, year: 2026 }))
      .toEqual({ date: '2026-02-10', daysUntil: 0, year: 2025 });
  });

  it('kỵ dương đã qua → năm sau', () => {
    expect(nextOccurrence({ calendar: 'SOLAR', day: 1, month: 1 }, today))
      .toEqual({ date: '2027-01-01', daysUntil: 107, year: 2027 });
  });
});

describe('recurringDateError', () => {
  it.each([
    [{ calendar: 'LUNAR', day: 30, month: 12, isLeapMonth: true }, null],
    [{ calendar: 'LUNAR', day: 31, month: 1, isLeapMonth: false }, 'Ngày âm lịch phải từ 1 đến 30'],
    [{ calendar: 'SOLAR', day: 29, month: 2, isLeapMonth: false }, null],
    [{ calendar: 'SOLAR', day: 30, month: 2, isLeapMonth: false }, 'Tháng 2 chỉ có 29 ngày'],
    [{ calendar: 'SOLAR', day: 1, month: 2, isLeapMonth: true }, 'Chỉ ngày âm lịch mới có tháng nhuận'],
    [{ calendar: 'LUNAR', day: 1, month: 13, isLeapMonth: false }, 'Tháng phải từ 1 đến 12'],
    [{ calendar: 'JULIAN', day: 1, month: 1, isLeapMonth: false }, 'calendar không hợp lệ'],
  ])('%j → %s', (input, expected) => {
    expect(recurringDateError(input)).toBe(expected);
  });
});

describe('parseDeathAnniversaryNote', () => {
  it.each([
    ['Sinh năm Giáp Tý. Kỵ: 23.12 Âm lịch. Mộ: Đồng Cát', { day: 23, month: 12, isLeapMonth: false }],
    ['Kỵ: 5/3 âm lịch', { day: 5, month: 3, isLeapMonth: false }],
    ['Kỵ: 10.4 nhuận Âm lịch', { day: 10, month: 4, isLeapMonth: true }],
    ['Kỵ: 32.1 Âm lịch', null],
    ['Kỵ: không rõ', null],
    [null, null],
  ])('%s', (text, expected) => {
    expect(parseDeathAnniversaryNote(text)).toEqual(expected);
  });
});

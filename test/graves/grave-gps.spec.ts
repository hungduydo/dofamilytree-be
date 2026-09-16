import { areaKey, parseAreaCoordinates, planAreaUpdates } from '../../src/graves/grave-areas';
import { resolveGpsPrecision } from '../../src/graves/grave-gps';

describe('resolveGpsPrecision', () => {
  const area = { latitude: 16.78, longitude: 107.18, gpsPrecision: 'AREA' };

  it('không đủ toạ độ → null', () => {
    expect(resolveGpsPrecision({ latitude: null, longitude: null })).toBeNull();
    expect(resolveGpsPrecision({ latitude: 16.7, longitude: null, gpsPrecision: 'EXACT' })).toBeNull();
  });

  it('toạ độ mới → EXACT, trừ khi người gọi nói rõ', () => {
    expect(resolveGpsPrecision({ latitude: 16.7, longitude: 107.1 })).toBe('EXACT');
    expect(resolveGpsPrecision({ latitude: 16.7, longitude: 107.1, gpsPrecision: 'AREA' })).toBe('AREA');
  });

  it('lưu lại form với toạ độ cũ → giữ AREA', () => {
    expect(resolveGpsPrecision({ latitude: 16.78, longitude: 107.18 }, area)).toBe('AREA');
  });

  it('chấm lại tại mộ → EXACT', () => {
    expect(resolveGpsPrecision({ latitude: 16.7801, longitude: 107.18 }, area)).toBe('EXACT');
  });

  it('mộ cũ chưa có precision nhưng có toạ độ → EXACT', () => {
    expect(resolveGpsPrecision({ latitude: 1, longitude: 2 }, { latitude: 1, longitude: 2, gpsPrecision: null })).toBe('EXACT');
  });
});

describe('parseAreaCoordinates', () => {
  it('bỏ qua ghi chú và khu chưa có toạ độ, so khớp không phân biệt hoa thường', () => {
    const areas = parseAreaCoordinates({ _huong_dan: 'x', 'Đùng Vành': [16.78, 107.18], 'Nương Âm': null });
    expect(areas.size).toBe(1);
    expect(areas.get(areaKey('đùng  vành'))).toEqual({ latitude: 16.78, longitude: 107.18 });
  });

  it.each([[{ A: [16.78] }], [{ A: ['16', '107'] }], [{ A: [107.18, 16.78, 0] }], [{ A: [95, 10] }], [[]]])(
    'từ chối dữ liệu sai %j',
    (raw) => {
      expect(() => parseAreaCoordinates(raw)).toThrow();
    },
  );

  it('file thật đọc được', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const areas = parseAreaCoordinates(require('../../scripts/data/grave-areas.json'));
    expect(areas.get(areaKey('Đùng Vành'))).toEqual({ latitude: 16.782336364012078, longitude: 107.1890720940045 });
  });
});

describe('planAreaUpdates', () => {
  const areas = parseAreaCoordinates({ 'Đùng Vành': [16.79, 107.19] });
  const row = (over: object) => ({
    id: 'g', name: 'Mộ A', description: 'Đùng Vành', latitude: null, longitude: null, gpsPrecision: null, ...over,
  });
  const plan = (over: object) => planAreaUpdates([row(over)], areas).map((u) => u.action);

  it('mộ chưa có toạ độ → gắn', () => expect(plan({})).toEqual(['fill']));
  it('mộ AREA, file đổi toạ độ → cập nhật', () =>
    expect(plan({ latitude: 16.78, longitude: 107.18, gpsPrecision: 'AREA' })).toEqual(['move']));
  it('mộ AREA đã đúng toạ độ → bỏ qua', () =>
    expect(plan({ latitude: 16.79, longitude: 107.19, gpsPrecision: 'AREA' })).toEqual([]));
  it('mộ EXACT → không bao giờ đụng tới', () =>
    expect(plan({ latitude: 16.78, longitude: 107.18, gpsPrecision: 'EXACT' })).toEqual([]));
  it('khu không có trong file / mộ không có khu → bỏ qua', () => {
    expect(plan({ description: 'Nương Âm' })).toEqual([]);
    expect(plan({ description: null })).toEqual([]);
  });
});

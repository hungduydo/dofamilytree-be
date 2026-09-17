import {
  AreaRow, GraveRow, areaKey, parseAreaCoordinates, planAreaBackfill, squareAround,
} from '../../src/graves/grave-areas';
import { polygonCentroid } from '../../src/graves/grave-location';

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
    expect(areas.get(areaKey('Đùng Vành'))).toEqual({ latitude: expect.any(Number), longitude: expect.any(Number) });
  });
});

describe('squareAround', () => {
  it('ô vuông ~15 m nhận chính điểm đó làm tâm', () => {
    const square = squareAround({ latitude: 16.78, longitude: 107.18 });
    expect(square).toHaveLength(4);
    const c = polygonCentroid(square)!;
    expect(c.latitude).toBeCloseTo(16.78, 9);
    expect(c.longitude).toBeCloseTo(107.18, 9);
    const heightM = (square[2][0] - square[0][0]) * 111_320;
    expect(heightM).toBeCloseTo(15, 6);
  });
});

describe('planAreaBackfill', () => {
  const coords = parseAreaCoordinates({ 'Đùng Vành': [16.79, 107.19] });
  const grave = (over: Partial<GraveRow>): GraveRow => ({
    id: 'g', name: 'Mộ A', description: 'Đùng Vành', area_id: null, latitude: null, longitude: null, ...over,
  });

  it('tạo khu từ description, một khu cho nhiều cách viết', () => {
    const plan = planAreaBackfill(
      [grave({ id: 'a' }), grave({ id: 'b', description: 'đùng  vành' }), grave({ id: 'c', description: 'Nương Âm' })],
      [],
      coords,
    );
    expect(plan.create.map((a) => a.name)).toEqual(['Đùng Vành', 'Nương Âm']);
    expect(plan.create[0].polygon).toHaveLength(4);
    expect(plan.create[1].polygon).toBeNull();
    expect(plan.assign.map((a) => [a.grave.id, a.key])).toEqual([
      ['a', areaKey('Đùng Vành')],
      ['b', areaKey('Đùng Vành')],
      ['c', areaKey('Nương Âm')],
    ]);
  });

  it('khu đã có → không tạo lại, chỉ gắn', () => {
    const existing: AreaRow[] = [{ id: 'area-1', name: 'ĐÙNG VÀNH', polygon: [[1, 1], [1, 2], [2, 2]] }];
    const plan = planAreaBackfill([grave({})], existing, coords);
    expect(plan.create).toEqual([]);
    expect(plan.draw).toEqual([]);
    expect(plan.assign).toHaveLength(1);
  });

  it('khu đã có nhưng chưa vẽ, file có toạ độ → vẽ ô vuông tạm', () => {
    const plan = planAreaBackfill([], [{ id: 'area-1', name: 'Đùng Vành', polygon: null }], coords);
    expect(plan.draw).toEqual([{ id: 'area-1', name: 'Đùng Vành', polygon: squareAround({ latitude: 16.79, longitude: 107.19 }) }]);
  });

  it('mộ đã có khu hoặc không có description → bỏ qua', () => {
    const plan = planAreaBackfill([grave({ area_id: 'x' }), grave({ description: null }), grave({ description: '  ' })], [], coords);
    expect(plan.assign).toEqual([]);
    expect(plan.create).toEqual([]);
  });

  it('toạ độ trùng toạ độ khu → là toạ độ chép, bị xoá; toạ độ riêng → giữ', () => {
    const plan = planAreaBackfill(
      [grave({ id: 'copied', latitude: 16.79, longitude: 107.19 }), grave({ id: 'pinned', latitude: 16.7901, longitude: 107.19 })],
      [],
      coords,
    );
    expect(plan.assign.map((a) => [a.grave.id, a.clearCoordinates])).toEqual([
      ['copied', true],
      ['pinned', false],
    ]);
  });
});

import { isValidPolygon, polygonCentroid, resolveGraveLocation } from '../../src/graves/grave-location';

const square: [number, number][] = [
  [16.78, 107.18],
  [16.78, 107.19],
  [16.79, 107.19],
  [16.79, 107.18],
];

describe('isValidPolygon', () => {
  it('chấp nhận ≥ 3 đỉnh hợp lệ', () => {
    expect(isValidPolygon(square)).toBe(true);
    expect(isValidPolygon(square.slice(0, 3))).toBe(true);
  });

  it.each([
    [null],
    [[]],
    [square.slice(0, 2)],
    [[[16.78, 107.18], [16.78, 107.19], ['16', '107']]],
    [[[16.78, 107.18], [16.78, 107.19], [95, 107]]],
    [[[16.78, 107.18], [16.78, 107.19], [16.79, 190]]],
    [[[16.78, 107.18], [16.78, 107.19], [16.79]]],
    [[[16.78, 107.18], [16.78, 107.19], [16.79, NaN]]],
  ])('từ chối %j', (value) => {
    expect(isValidPolygon(value)).toBe(false);
  });
});

describe('polygonCentroid', () => {
  it('tâm hình vuông', () => {
    const c = polygonCentroid(square)!;
    expect(c.latitude).toBeCloseTo(16.785, 9);
    expect(c.longitude).toBeCloseTo(107.185, 9);
  });

  it('không phụ thuộc chiều vẽ', () => {
    const c = polygonCentroid([...square].reverse())!;
    expect(c.latitude).toBeCloseTo(16.785, 9);
    expect(c.longitude).toBeCloseTo(107.185, 9);
  });

  it('tâm theo diện tích, không phải trung bình đỉnh', () => {
    // Hình chữ L: trung bình đỉnh lệch khỏi tâm diện tích.
    const l: [number, number][] = [[0, 0], [0, 2], [1, 2], [1, 1], [2, 1], [2, 0]];
    const c = polygonCentroid(l)!;
    expect(c.latitude).toBeCloseTo(5 / 6, 9);
    expect(c.longitude).toBeCloseTo(5 / 6, 9);
  });

  it('điểm thẳng hàng → trung bình đỉnh', () => {
    expect(polygonCentroid([[0, 0], [0, 1], [0, 2]])).toEqual({ latitude: 0, longitude: 1 });
  });

  it('polygon sai → null', () => {
    expect(polygonCentroid(null)).toBeNull();
    expect(polygonCentroid([[0, 0]])).toBeNull();
  });
});

describe('resolveGraveLocation', () => {
  it('ưu tiên toạ độ của mộ', () => {
    expect(resolveGraveLocation({ latitude: 16.7, longitude: 107.1, area: { polygon: square } })).toEqual({
      latitude: 16.7,
      longitude: 107.1,
      source: 'GRAVE',
    });
  });

  it('không có toạ độ → tâm khu', () => {
    const loc = resolveGraveLocation({ latitude: null, longitude: null, area: { polygon: square } })!;
    expect(loc.source).toBe('AREA');
    expect(loc.latitude).toBeCloseTo(16.785, 9);
  });

  it('thiếu một nửa toạ độ coi như không có', () => {
    expect(resolveGraveLocation({ latitude: 16.7, longitude: null, area: { polygon: square } })?.source).toBe('AREA');
  });

  it('không toạ độ, không khu / khu chưa vẽ → null', () => {
    expect(resolveGraveLocation({ latitude: null, longitude: null })).toBeNull();
    expect(resolveGraveLocation({ latitude: null, longitude: null, area: null })).toBeNull();
    expect(resolveGraveLocation({ latitude: null, longitude: null, area: { polygon: null } })).toBeNull();
  });
});

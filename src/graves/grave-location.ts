/** Một đỉnh polygon: [vĩ độ, kinh độ]. */
export type LatLng = [number, number];

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** GRAVE = chấm tại chính ngôi mộ; AREA = tâm khu an táng (mộ chưa có toạ độ riêng). */
export type GraveLocationSource = 'GRAVE' | 'AREA';

export interface GraveLocation extends GeoPoint {
  source: GraveLocationSource;
}

export const MIN_POLYGON_VERTICES = 3;

const isLatLng = (value: unknown): value is LatLng =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
  Math.abs(value[0]) <= 90 &&
  Math.abs(value[1]) <= 180;

/** Polygon hợp lệ: mảng ≥ 3 cặp [vĩ độ, kinh độ] trong phạm vi. */
export function isValidPolygon(value: unknown): value is LatLng[] {
  return Array.isArray(value) && value.length >= MIN_POLYGON_VERTICES && value.every(isLatLng);
}

/**
 * Tâm hình học (centroid diện tích, công thức shoelace) của polygon.
 * Khu mộ chỉ rộng vài chục mét nên coi lat/lng là mặt phẳng là đủ chính xác.
 * Polygon suy biến (diện tích ≈ 0, ví dụ các điểm thẳng hàng) → trung bình các đỉnh.
 */
export function polygonCentroid(polygon: unknown): GeoPoint | null {
  if (!isValidPolygon(polygon)) return null;

  // Tính quanh đỉnh đầu: với toạ độ tuyệt đối (~107°) tích chéo của các số lớn
  // làm mất độ chính xác cỡ mét, đúng bằng kích thước một khu mộ.
  const [lat0, lng0] = polygon[0];
  let twiceArea = 0;
  let lat = 0;
  let lng = 0;
  for (let i = 0; i < polygon.length; i++) {
    const y0 = polygon[i][0] - lat0;
    const x0 = polygon[i][1] - lng0;
    const y1 = polygon[(i + 1) % polygon.length][0] - lat0;
    const x1 = polygon[(i + 1) % polygon.length][1] - lng0;
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    lng += (x0 + x1) * cross;
    lat += (y0 + y1) * cross;
  }

  // Ngưỡng tương đối theo kích thước polygon, không phải hằng số tuyệt đối.
  const span = Math.max(...polygon.map(([y, x]) => Math.max(Math.abs(y - lat0), Math.abs(x - lng0))));
  if (Math.abs(twiceArea) <= span * span * 1e-9) {
    return {
      latitude: polygon.reduce((sum, [y]) => sum + y, 0) / polygon.length,
      longitude: polygon.reduce((sum, [, x]) => sum + x, 0) / polygon.length,
    };
  }
  return { latitude: lat0 + lat / (3 * twiceArea), longitude: lng0 + lng / (3 * twiceArea) };
}

/**
 * Vị trí hiển thị của một mộ: toạ độ của chính ngôi mộ, không có thì tâm khu,
 * không có nữa thì null (không lên bản đồ).
 */
export function resolveGraveLocation(grave: {
  latitude: number | null;
  longitude: number | null;
  area?: { polygon: unknown } | null;
}): GraveLocation | null {
  if (grave.latitude != null && grave.longitude != null) {
    return { latitude: grave.latitude, longitude: grave.longitude, source: 'GRAVE' };
  }
  const center = polygonCentroid(grave.area?.polygon);
  return center ? { ...center, source: 'AREA' } : null;
}

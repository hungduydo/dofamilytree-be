/**
 * Toạ độ các khu mộ, đọc từ file JSON do ban liên lạc điền
 * (scripts/data/grave-areas.json): `{ "Đùng Vành": [16.78, 107.18], "Nương Âm": null }`.
 * Khoá bắt đầu bằng "_" là ghi chú, bị bỏ qua.
 */
export type AreaCoordinates = Map<string, { latitude: number; longitude: number }>;

/** Khoá so khớp: không phân biệt hoa thường và khoảng trắng thừa. */
export const areaKey = (place: string) => place.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');

export function parseAreaCoordinates(raw: unknown): AreaCoordinates {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('File khu mộ phải là một object { "tên khu": [vĩ độ, kinh độ] | null }');
  }
  const areas: AreaCoordinates = new Map();
  for (const [place, value] of Object.entries(raw)) {
    if (place.startsWith('_') || value === null) continue;
    const [latitude, longitude] = Array.isArray(value) ? value : [];
    const valid =
      Array.isArray(value) && value.length === 2 &&
      typeof latitude === 'number' && typeof longitude === 'number' &&
      Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    if (!valid) throw new Error(`Toạ độ không hợp lệ cho "${place}": ${JSON.stringify(value)}`);
    areas.set(areaKey(place), { latitude, longitude });
  }
  return areas;
}

export interface GraveLocationRow {
  id: string;
  name: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  gpsPrecision: string | null;
}

export type AreaUpdate = GraveLocationRow & {
  /** fill = mộ chưa có toạ độ; move = toạ độ khu trong file đã đổi. */
  action: 'fill' | 'move';
  next: { latitude: number; longitude: number };
};

/**
 * Mộ nào cần nhận toạ độ khu từ file:
 *  - chưa có toạ độ → gắn toạ độ khu;
 *  - đang dùng toạ độ khu (AREA) mà file đã đổi → cập nhật theo file.
 * Mộ EXACT (đã chấm tại mộ) không bao giờ bị động tới. Khu bị xoá/để null
 * trong file cũng KHÔNG xoá toạ độ đã gắn — muốn gỡ thì sửa tay trong BO.
 */
export function planAreaUpdates(graves: GraveLocationRow[], areas: AreaCoordinates): AreaUpdate[] {
  return graves.flatMap((g): AreaUpdate[] => {
    const next = g.description ? areas.get(areaKey(g.description)) : undefined;
    if (!next) return [];
    if (g.latitude == null || g.longitude == null) return [{ ...g, action: 'fill', next }];
    const moved = g.latitude !== next.latitude || g.longitude !== next.longitude;
    if (g.gpsPrecision === 'AREA' && moved) return [{ ...g, action: 'move', next }];
    return [];
  });
}

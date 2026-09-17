import { LatLng } from './grave-location';

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

/** Nửa cạnh (mét) của ô vuông tạm quanh toạ độ khu — admin vẽ lại ranh giới thật trong BO. */
export const PLACEHOLDER_HALF_SIDE_M = 7.5;
const METERS_PER_DEGREE_LAT = 111_320;

/** Ô vuông nhỏ quanh một điểm, dạng polygon [[vĩ độ, kinh độ], ...]. */
export function squareAround({ latitude, longitude }: { latitude: number; longitude: number }, halfSideM = PLACEHOLDER_HALF_SIDE_M): LatLng[] {
  const dLat = halfSideM / METERS_PER_DEGREE_LAT;
  const dLng = halfSideM / (METERS_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180));
  return [
    [latitude - dLat, longitude - dLng],
    [latitude - dLat, longitude + dLng],
    [latitude + dLat, longitude + dLng],
    [latitude + dLat, longitude - dLng],
  ];
}

export interface GraveRow {
  id: string;
  name: string;
  description: string | null;
  area_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface AreaRow {
  id: string;
  name: string;
  polygon: unknown;
}

export interface AreaBackfillPlan {
  /** Khu chưa có trong bảng — tên lấy đúng chữ của mộ đầu tiên gặp. */
  create: Array<{ key: string; name: string; polygon: LatLng[] | null }>;
  /** Khu đã có nhưng chưa vẽ, và file có toạ độ → ô vuông tạm. */
  draw: Array<{ id: string; name: string; polygon: LatLng[] }>;
  /**
   * Mộ chưa có khu, gắn theo description. description của các mộ này CHÍNH LÀ
   * tên khu (backfill cũ ghi vậy) nên bị xoá sau khi gắn — nó nay nằm ở area_id.
   */
  assign: Array<{
    grave: GraveRow;
    key: string;
    /** Toạ độ của mộ trùng toạ độ khu trong file → là toạ độ chép từ khu, không phải chấm tại mộ. */
    clearCoordinates: boolean;
  }>;
}

/**
 * Chuyển "khu mộ" từ text trong description sang bảng grave_areas:
 *  - mỗi description khác nhau (so theo areaKey) là một khu;
 *  - khu mới nhận ô vuông tạm quanh toạ độ trong file (nếu có);
 *  - mộ chưa có area_id được gắn khu; description (= tên khu) được xoá. Mộ đã có khu không bao giờ bị đổi,
 *    nên admin sửa tay trong BO rồi chạy lại vẫn an toàn.
 */
export function planAreaBackfill(graves: GraveRow[], existing: AreaRow[], coords: AreaCoordinates): AreaBackfillPlan {
  const byKey = new Map(existing.map((a) => [areaKey(a.name), a]));
  const create = new Map<string, AreaBackfillPlan['create'][number]>();
  const assign: AreaBackfillPlan['assign'] = [];

  for (const grave of graves) {
    const place = grave.description?.trim();
    if (grave.area_id || !place) continue;
    const key = areaKey(place);
    const point = coords.get(key);
    if (!byKey.has(key) && !create.has(key)) {
      create.set(key, { key, name: place.replace(/\s+/g, ' '), polygon: point ? squareAround(point) : null });
    }
    assign.push({
      grave,
      key,
      clearCoordinates: !!point && grave.latitude === point.latitude && grave.longitude === point.longitude,
    });
  }

  const draw = existing.flatMap((a) => {
    const point = coords.get(areaKey(a.name));
    return a.polygon == null && point ? [{ id: a.id, name: a.name, polygon: squareAround(point) }] : [];
  });

  return { create: [...create.values()], draw, assign };
}

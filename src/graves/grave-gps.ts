export const GPS_PRECISIONS = ['EXACT', 'AREA'] as const;
export type GpsPrecision = (typeof GPS_PRECISIONS)[number];

interface GpsState {
  latitude: number | null;
  longitude: number | null;
  gpsPrecision: string | null;
}

/**
 * Độ chính xác sau khi ghi, giữ bất biến "có precision ⇔ có đủ toạ độ"
 * (CHECK ở 010_cemetery_gps_precision.sql):
 *  - không đủ toạ độ → null;
 *  - người gọi nói rõ → dùng giá trị đó;
 *  - toạ độ mới hoặc vừa đổi → EXACT (ai đó vừa chấm tại mộ);
 *  - toạ độ giữ nguyên → giữ precision cũ. Form BO gửi lại toạ độ mỗi lần lưu,
 *    nên sửa tên một mộ AREA không được biến nó thành EXACT.
 */
export function resolveGpsPrecision(
  next: { latitude: number | null; longitude: number | null; gpsPrecision?: GpsPrecision | null },
  previous?: GpsState | null,
): GpsPrecision | null {
  if (next.latitude == null || next.longitude == null) return null;
  if (next.gpsPrecision) return next.gpsPrecision;
  const unchanged =
    previous?.latitude === next.latitude && previous?.longitude === next.longitude && previous.gpsPrecision;
  return unchanged ? (previous!.gpsPrecision as GpsPrecision) : 'EXACT';
}

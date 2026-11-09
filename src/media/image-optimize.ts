import sharp from 'sharp';

/**
 * Cạnh dài tối đa (px) của ảnh lưu trữ: 4K UHD (3840×2160). Vừa khít màn 4K,
 * in đẹp khổ A4 ở ~320 dpi, trong khi ảnh điện thoại/máy ảnh (6000×4000,
 * 12–25 MB) về còn khoảng 1–2 MB WebP. Ảnh nhỏ hơn giữ nguyên kích thước
 * (không phóng to).
 */
export const MAX_IMAGE_DIMENSION = 3840;

/** Chất lượng WebP lossy — 85 khó phân biệt bằng mắt với bản gốc. */
export const IMAGE_QUALITY = 85;

/** Định dạng lưu trữ duy nhất của ảnh đã xử lý. */
export const OPTIMIZED_IMAGE_MIME = 'image/webp';

export interface OptimizedImage {
  buffer: Buffer;
  /** MIME của `buffer`: `image/webp` khi đã xử lý, MIME gốc khi giữ nguyên. */
  mimetype: string;
  /** true khi trả về bản đã xử lý; false khi giữ nguyên input (định dạng sharp không đọc/không nên đụng). */
  optimized: boolean;
  width?: number;
  height?: number;
}

/**
 * Thu nhỏ về ≤ 4K và chuyển sang **WebP** trước khi lưu. **Thay thế bản gốc** —
 * không giữ file gốc (quyết định sản phẩm: dung lượng lưu trữ và tốc độ tải
 * thư viện quan trọng hơn độ phân giải/định dạng gốc).
 *
 * - JPEG / WebP → WebP lossy q85.
 * - PNG → WebP **lossless** (ảnh chụp màn hình/scan có chữ không chịu được nén
 *   mất dữ liệu) — vẫn nhỏ hơn PNG đáng kể.
 * - `.rotate()` áp EXIF orientation trước khi sharp bỏ metadata (mặc định) —
 *   thiếu nó ảnh chụp dọc bị xoay. Bỏ metadata cũng bỏ luôn toạ độ GPS.
 * - Định dạng khác (GIF động, HEIC — sharp bản build sẵn không đọc HEVC, SVG…)
 *   giữ nguyên.
 * - Không giữ bản gốc kể cả khi WebP to hơn chút: mọi ảnh trong thư viện cùng
 *   một định dạng là yêu cầu sản phẩm.
 */
export async function optimizeImage(input: Buffer, mimetype: string): Promise<OptimizedImage> {
  if (mimetype !== 'image/jpeg' && mimetype !== 'image/png' && mimetype !== 'image/webp') {
    return { buffer: input, mimetype, optimized: false };
  }

  const { data, info } = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp(
      mimetype === 'image/png'
        ? { lossless: true, effort: 4 }
        : { quality: IMAGE_QUALITY, effort: 4, smartSubsample: true },
    )
    .toBuffer({ resolveWithObject: true });

  return { buffer: data, mimetype: OPTIMIZED_IMAGE_MIME, optimized: true, width: info.width, height: info.height };
}

/** Đổi đuôi tên file theo MIME đầu ra: `IMG_01.JPG` + webp → `IMG_01.webp`. */
export function filenameForMime(filename: string, mimetype: string): string {
  if (mimetype !== OPTIMIZED_IMAGE_MIME) return filename;
  const base = filename.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return `${base || 'image'}.webp`;
}

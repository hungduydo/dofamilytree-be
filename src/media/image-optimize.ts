import sharp from 'sharp';

/**
 * Cạnh dài tối đa (px) của ảnh lưu trữ. 3000px vẫn in đẹp khổ A4 ở ~250 dpi và
 * xem nét trên màn 4K, trong khi ảnh điện thoại/máy ảnh (6000×4000, 12–25 MB)
 * về còn khoảng 1–2 MB. Ảnh nhỏ hơn giữ nguyên kích thước (không phóng to).
 */
export const MAX_IMAGE_DIMENSION = 3000;

/** Chất lượng JPEG/WebP sau khi nén — 85 khó phân biệt bằng mắt với bản gốc. */
export const IMAGE_QUALITY = 85;

export interface OptimizedImage {
  buffer: Buffer;
  /** true khi trả về bản đã xử lý; false khi giữ nguyên input (định dạng không hỗ trợ, hoặc bản nén không nhỏ hơn). */
  optimized: boolean;
  width?: number;
  height?: number;
}

/**
 * Thu nhỏ + nén ảnh trước khi lưu. **Thay thế bản gốc** — không giữ file gốc
 * (quyết định sản phẩm: dung lượng lưu trữ và tốc độ tải thư viện quan trọng
 * hơn độ phân giải gốc).
 *
 * - JPEG → mozjpeg q85 progressive; WebP → lossy q85; PNG → vẫn lossless (ảnh
 *   chụp màn hình/scan có chữ không chịu được nén mất dữ liệu) nhưng được resize.
 * - `.rotate()` áp EXIF orientation trước khi sharp bỏ metadata (mặc định) —
 *   thiếu nó ảnh chụp dọc bị xoay. Bỏ metadata cũng bỏ luôn toạ độ GPS.
 * - Định dạng khác (GIF động, HEIC — sharp bản build sẵn không đọc HEVC, SVG…)
 *   giữ nguyên.
 * - Không bao giờ làm file to ra: nếu ảnh không cần thu nhỏ mà bản nén lại lớn
 *   hơn bản gốc (JPEG đã nén kỹ), giữ bản gốc.
 */
export async function optimizeImage(input: Buffer, mimetype: string): Promise<OptimizedImage> {
  if (mimetype !== 'image/jpeg' && mimetype !== 'image/png' && mimetype !== 'image/webp') {
    return { buffer: input, optimized: false };
  }

  const pipeline = sharp(input, { failOn: 'none' })
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });

  const encoded =
    mimetype === 'image/jpeg'
      ? pipeline.jpeg({ mozjpeg: true, quality: IMAGE_QUALITY, progressive: true })
      : mimetype === 'image/png'
        ? pipeline.png({ compressionLevel: 9, effort: 10 })
        : pipeline.webp({ quality: IMAGE_QUALITY, effort: 5 });

  const { data, info } = await encoded.toBuffer({ resolveWithObject: true });

  if (data.length >= input.length) {
    // Bản nén to hơn. Chỉ chấp nhận khi ảnh gốc vượt trần kích thước — khi đó
    // giữ gốc nghĩa là giữ một ảnh 6000px, đúng thứ cần loại bỏ.
    const meta = await sharp(input, { failOn: 'none' }).metadata();
    const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (longest <= MAX_IMAGE_DIMENSION) {
      return { buffer: input, optimized: false, width: meta.width, height: meta.height };
    }
  }

  return { buffer: data, optimized: true, width: info.width, height: info.height };
}

import sharp from 'sharp';
import { MAX_IMAGE_DIMENSION, filenameForMime, optimizeImage } from '../../src/media/image-optimize';

/** Noisy photo-like image — flat colours would compress to nothing and prove little. */
async function photo(width: number, height: number, format: 'jpeg' | 'png' | 'webp', opts: object = {}) {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  const img = sharp(raw, { raw: { width, height, channels } });
  if (format === 'jpeg') return img.jpeg({ quality: 98, ...opts }).toBuffer();
  if (format === 'png') return img.png().toBuffer();
  return img.webp({ quality: 98 }).toBuffer();
}

describe('optimizeImage', () => {
  it('caps at 4K (3840px)', () => {
    expect(MAX_IMAGE_DIMENSION).toBe(3840);
  });

  it('shrinks a large JPEG to 4K, converts it to WebP and makes it much smaller', async () => {
    const input = await photo(5760, 3840, 'jpeg');
    const out = await optimizeImage(input, 'image/jpeg');
    expect(out.optimized).toBe(true);
    expect(out.mimetype).toBe('image/webp');
    expect([out.width, out.height]).toEqual([3840, 2560]);
    expect(out.buffer.length).toBeLessThan(input.length * 0.7);
    expect((await sharp(out.buffer).metadata()).format).toBe('webp');
  });

  it('keeps portrait orientation inside the cap', async () => {
    const out = await optimizeImage(await photo(2000, 4800, 'webp'), 'image/webp');
    expect([out.width, out.height]).toEqual([1600, 3840]);
    expect((await sharp(out.buffer).metadata()).format).toBe('webp');
  });

  it('converts PNG to lossless WebP', async () => {
    const input = await photo(4200, 1400, 'png');
    const out = await optimizeImage(input, 'image/png');
    expect(out.width).toBe(MAX_IMAGE_DIMENSION);
    expect(out.mimetype).toBe('image/webp');
    expect((await sharp(out.buffer).metadata()).format).toBe('webp');
    // Lossless: pixels survive exactly at the same size.
    const small = await photo(64, 64, 'png');
    const roundTrip = await optimizeImage(small, 'image/png');
    const [a, b] = await Promise.all([
      sharp(small).raw().toBuffer(),
      sharp(roundTrip.buffer).removeAlpha().raw().toBuffer(),
    ]);
    expect(b.equals(a)).toBe(true);
  });

  it('never enlarges a small image, and still outputs WebP', async () => {
    const out = await optimizeImage(await photo(800, 600, 'jpeg'), 'image/jpeg');
    expect(out.mimetype).toBe('image/webp');
    expect((await sharp(out.buffer).metadata()).width).toBe(800);
  });

  it('applies EXIF orientation before the metadata is dropped', async () => {
    // Stored landscape, EXIF says "rotate 90°" → displayed portrait.
    const input = await sharp(await photo(5000, 2500, 'jpeg')).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = await optimizeImage(input, 'image/jpeg');
    expect([out.width, out.height]).toEqual([1920, 3840]);
    expect((await sharp(out.buffer).metadata()).orientation).toBeUndefined();
  });

  it('passes other formats through untouched', async () => {
    const gif = Buffer.from('GIF89a-not-really');
    await expect(optimizeImage(gif, 'image/gif')).resolves.toEqual({
      buffer: gif, mimetype: 'image/gif', optimized: false,
    });
    await expect(optimizeImage(gif, 'image/heic')).resolves.toMatchObject({ optimized: false, mimetype: 'image/heic' });
  });
});

describe('filenameForMime', () => {
  it.each([
    ['IMG_0001.JPG', 'IMG_0001.webp'],
    ['Giỗ Tổ 2024.jpeg', 'Giỗ Tổ 2024.webp'],
    ['scan.png', 'scan.webp'],
    ['no-extension', 'no-extension.webp'],
    ['.jpg', 'image.webp'],
  ])('%s → %s', (input, expected) => {
    expect(filenameForMime(input, 'image/webp')).toBe(expected);
  });

  it('leaves non-WebP output alone', () => {
    expect(filenameForMime('clip.mp4', 'video/mp4')).toBe('clip.mp4');
  });
});

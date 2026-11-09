import sharp from 'sharp';
import { MAX_IMAGE_DIMENSION, optimizeImage } from '../../src/media/image-optimize';

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
  it('shrinks a large JPEG to the size cap and makes it much smaller', async () => {
    const input = await photo(4500, 3000, 'jpeg');
    const out = await optimizeImage(input, 'image/jpeg');
    expect(out.optimized).toBe(true);
    expect(out.width).toBe(MAX_IMAGE_DIMENSION);
    expect(out.height).toBe(2000);
    expect(out.buffer.length).toBeLessThan(input.length * 0.7);
    expect((await sharp(out.buffer).metadata()).format).toBe('jpeg');
  });

  it('keeps portrait orientation inside the cap', async () => {
    const out = await optimizeImage(await photo(2000, 4000, 'webp'), 'image/webp');
    expect([out.width, out.height]).toEqual([1500, 3000]);
    expect((await sharp(out.buffer).metadata()).format).toBe('webp');
  });

  it('resizes PNG but keeps it PNG', async () => {
    const out = await optimizeImage(await photo(3600, 1200, 'png'), 'image/png');
    expect(out.width).toBe(MAX_IMAGE_DIMENSION);
    expect((await sharp(out.buffer).metadata()).format).toBe('png');
  });

  it('never enlarges a small image, and never returns something bigger than it was given', async () => {
    const input = await sharp(await photo(800, 600, 'jpeg')).jpeg({ quality: 60, mozjpeg: true }).toBuffer();
    const out = await optimizeImage(input, 'image/jpeg');
    expect(out.buffer.length).toBeLessThanOrEqual(input.length);
    expect((await sharp(out.buffer).metadata()).width).toBe(800);
  });

  it('applies EXIF orientation before the metadata is dropped', async () => {
    // Stored landscape, EXIF says "rotate 90°" → displayed portrait.
    const input = await sharp(await photo(4000, 2000, 'jpeg')).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = await optimizeImage(input, 'image/jpeg');
    expect([out.width, out.height]).toEqual([1500, 3000]);
    expect((await sharp(out.buffer).metadata()).orientation).toBeUndefined();
  });

  it('passes other formats through untouched', async () => {
    const gif = Buffer.from('GIF89a-not-really');
    await expect(optimizeImage(gif, 'image/gif')).resolves.toEqual({ buffer: gif, optimized: false });
    await expect(optimizeImage(gif, 'image/heic')).resolves.toMatchObject({ optimized: false });
  });
});

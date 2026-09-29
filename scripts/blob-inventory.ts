/**
 * Kiểm kê những gì CÒN nằm trên Vercel Blob, để quyết định gỡ hẳn provider đó.
 *
 * Kho ảnh mới đi R2 (STORAGE_PROVIDER=r2), nhưng file upload thời trước vẫn có
 * thể nằm trên Blob — StorageService.del() route theo URL nên vẫn xoá được
 * chúng. Gỡ VercelBlobProvider + @vercel/blob khi còn file ở đó nghĩa là:
 * ảnh vẫn hiện (URL public), nhưng xoá media/avatar sẽ để lại file mồ côi.
 *
 * CHỈ ĐỌC — không sửa DB, không đụng file.
 *
 *   pnpm storage:blob-inventory
 *
 * Kết quả "0 dòng DB trỏ tới Blob" + "0 file trên Blob" ⇒ an toàn để gỡ:
 *   - src/storage/vercel-blob.provider.ts và chỗ đăng ký trong storage.module/service,
 *   - dependency @vercel/blob, biến BLOB_READ_WRITE_TOKEN,
 *   - nhánh Vercel Blob trong scripts/backup/storage-manifest.ts.
 * Còn dòng DB trỏ tới Blob ⇒ copy file sang R2 và cập nhật URL trước.
 */

import { PrismaClient } from '@prisma/client';

const BLOB_HOST = '.public.blob.vercel-storage.com';
const LIKE = `%${BLOB_HOST}%`;

/** Mọi cột lưu URL file. Thêm cột URL mới vào schema ⇒ thêm vào đây. */
const COLUMNS: Array<{ label: string; sql: string }> = [
  { label: 'members.avatar_url', sql: `SELECT count(*) FROM members WHERE avatar_url LIKE $1` },
  { label: 'media.file_path', sql: `SELECT count(*) FROM media WHERE file_path LIKE $1` },
  { label: 'media_albums.cover_url', sql: `SELECT count(*) FROM media_albums WHERE cover_url LIKE $1` },
  { label: 'articles."coverUrl"', sql: `SELECT count(*) FROM articles WHERE "coverUrl" LIKE $1` },
  { label: 'trees.image', sql: `SELECT count(*) FROM trees WHERE image LIKE $1` },
  { label: 'cemeteries.photo_url', sql: `SELECT count(*) FROM cemeteries WHERE photo_url LIKE $1` },
  { label: 'events.images[]', sql: `SELECT count(*) FROM events WHERE array_to_string(images, ' ') LIKE $1` },
  { label: 'memories.photos[]', sql: `SELECT count(*) FROM memories WHERE array_to_string(photos, ' ') LIKE $1` },
  { label: 'contact_info.venue_image', sql: `SELECT count(*) FROM contact_info WHERE venue_image LIKE $1` },
  { label: 'contact_message.attachments', sql: `SELECT count(*) FROM contact_message WHERE attachments::text LIKE $1` },
];

async function blobFiles(): Promise<{ files: number; bytes: number } | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const { list } = await import('@vercel/blob');
  let cursor: string | undefined;
  let files = 0;
  let bytes = 0;
  do {
    const res = await list({ cursor, limit: 1000, token: process.env.BLOB_READ_WRITE_TOKEN });
    files += res.blobs.length;
    for (const b of res.blobs) bytes += b.size;
    cursor = res.cursor;
  } while (cursor);
  return { files, bytes };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Dòng DB còn trỏ tới Vercel Blob:');
    let refs = 0;
    for (const c of COLUMNS) {
      const [row] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(c.sql, LIKE);
      const n = Number(row.count);
      refs += n;
      console.log(`  ${n.toString().padStart(6)}  ${c.label}`);
    }
    console.log(`  ${refs.toString().padStart(6)}  TỔNG`);

    const files = await blobFiles();
    console.log(
      files
        ? `\nFile trên Vercel Blob: ${files.files} (${(files.bytes / 1024 / 1024).toFixed(1)} MB)`
        : '\nFile trên Vercel Blob: không kiểm được (thiếu BLOB_READ_WRITE_TOKEN)',
    );

    if (refs === 0 && files?.files === 0) {
      console.log('\n✓ Không còn gì trên Vercel Blob — gỡ được provider (xem đầu file này).');
    } else if (refs === 0 && files) {
      console.log('\n• DB không còn trỏ tới Blob, nhưng Blob còn file mồ côi — xoá được trên dashboard Vercel, rồi gỡ provider.');
    } else {
      console.log('\n✗ Còn dữ liệu dùng Vercel Blob — chuyển file sang R2 và cập nhật URL trước khi gỡ provider.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

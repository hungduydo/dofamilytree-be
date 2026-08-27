/**
 * Backfill `type` / `mime_type` / `size_bytes` cho các record media cũ.
 *
 * Bối cảnh: các record nhập từ Supabase Storage (trước khi có luồng upload hiện
 * tại) chỉ có `file_path`, mọi cột metadata đều NULL. Hậu quả trên API:
 *
 *   - `GET /media/stats` từng gộp `type IS NULL` vào bucket `documents` ⇒ báo
 *     "7 tài liệu" trong khi `GET /media?type=document` trả về rỗng, vì list
 *     lọc `type = 'document'` (NULL không khớp). Bucket documents đã được sửa
 *     cho khớp list; script này xoá nốt nguyên nhân gốc là dữ liệu NULL.
 *   - `storageUsedBytes` cộng thiếu, vì SUM bỏ qua record `size_bytes` NULL.
 *
 * `type`/`mime_type` suy từ đuôi file trong `file_path` — nguồn duy nhất còn
 * lại. `size_bytes` lấy bằng HEAD request tới URL public (chỉ đọc, không tải
 * nội dung); record nào HEAD thất bại thì bỏ qua `size_bytes` và vẫn giữ
 * `type` — có metadata một phần vẫn hơn không có gì.
 *
 * Usage:
 *   pnpm backfill:media -- --dry-run    # chỉ in ra sẽ đổi gì, KHÔNG ghi
 *   pnpm backfill:media
 */

import { PrismaClient } from '@prisma/client';
import { classifyMediaType } from '../src/media/media.constants';

const prisma = new PrismaClient();

/** Đuôi file → MIME. Chỉ liệt kê thứ thực sự có trong thư viện gia phả. */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', heic: 'image/heic',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mkv: 'video/x-matroska', avi: 'video/x-msvideo', m4v: 'video/x-m4v',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg',
  flac: 'audio/flac', aac: 'audio/aac',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
};

function mimeFromPath(filePath: string): string | null {
  // Bỏ query string trước khi lấy đuôi — URL có ?token=… sẽ làm hỏng phép cắt.
  const withoutQuery = filePath.split('?')[0];
  const ext = withoutQuery.split('.').pop()?.toLowerCase();
  return (ext && MIME_BY_EXTENSION[ext]) || null;
}

/** `null` nếu không HEAD được (URL chết, host chặn HEAD, thiếu Content-Length). */
async function remoteSize(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return null;
    const len = res.headers.get('content-length');
    return len ? Number(len) : null;
  } catch {
    return null;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const rows = await prisma.media.findMany({
    where: { OR: [{ type: null }, { mime_type: null }, { size_bytes: null }] },
    select: { id: true, file_path: true, type: true, mime_type: true, size_bytes: true, status: true },
  });

  console.log(`Tìm thấy ${rows.length} record thiếu metadata${dryRun ? ' (dry-run)' : ''}\n`);

  let updated = 0;
  let noMime = 0;
  let noSize = 0;

  for (const row of rows) {
    const mime = row.mime_type ?? mimeFromPath(row.file_path);
    if (!mime) {
      noMime++;
      console.log(`  BỎ QUA ${row.id} — không suy được MIME từ: ${row.file_path.slice(0, 80)}`);
      continue;
    }

    const data: { type?: string; mime_type?: string; size_bytes?: number } = {};
    if (!row.type) data.type = classifyMediaType(mime);
    if (!row.mime_type) data.mime_type = mime;

    if (row.size_bytes === null) {
      // Record `pending` chưa có file trên storage — HEAD chắc chắn hỏng, đừng phí request.
      const size = row.status === 'ready' ? await remoteSize(row.file_path) : null;
      if (size !== null) data.size_bytes = size;
      else noSize++;
    }

    if (Object.keys(data).length === 0) continue;

    console.log(`  ${row.id} ← ${JSON.stringify(data)}`);
    if (!dryRun) await prisma.media.update({ where: { id: row.id }, data });
    updated++;
  }

  console.log(`\n${dryRun ? 'SẼ cập nhật' : 'Đã cập nhật'}: ${updated} record`);
  if (noMime) console.log(`Không suy được MIME: ${noMime} record (cần sửa tay)`);
  if (noSize) console.log(`Không HEAD được size: ${noSize} record (storageUsedBytes vẫn thiếu phần này)`);
  if (!dryRun && updated > 0) {
    console.log('\nNhớ xoá cache stats để /media/stats trả số mới ngay: khoá `media:stats` trên Redis.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

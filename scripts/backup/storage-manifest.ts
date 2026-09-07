/**
 * Liệt kê toàn bộ object trong kho ảnh (Cloudflare R2 và/hoặc Vercel Blob).
 *
 * TẠI SAO: `Media.file_path` và `Member.avatar_url` trỏ theo UUID của member —
 * DB và kho ảnh phải khôi phục thành CẶP KHỚP NHAU. Manifest cho phép:
 *   1. phát hiện file bị mất (so manifest hôm nay với hôm qua),
 *   2. biết chính xác cần copy lại những key nào từ bucket backup.
 *
 * Đây là bản kê, KHÔNG phải bản sao. Bản sao thật do
 * .github/workflows/storage-sync.yml (rclone sync sang bucket backup) lo —
 * R2 không có object versioning nên bucket thứ hai là cách duy nhất chống xoá nhầm.
 *
 * Cách chạy:
 *   pnpm backup:storage-manifest
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

type Entry = { key: string; size: number; etag?: string; lastModified?: string };

/** Cùng cấu hình client với src/storage/r2.provider.ts. */
async function listR2(): Promise<Entry[] | null> {
  const { R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_BUCKET_NAME || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  const entries: Entry[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, ContinuationToken: token, MaxKeys: 1000 }),
    );
    for (const o of res.Contents ?? []) {
      if (!o.Key) continue;
      entries.push({
        key: o.Key,
        size: o.Size ?? 0,
        etag: o.ETag?.replace(/"/g, ''),
        lastModified: o.LastModified?.toISOString(),
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return entries;
}

/** Vercel Blob: import động vì repo có thể chạy hoàn toàn trên R2. */
async function listVercelBlob(): Promise<Entry[] | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const { list } = await import('@vercel/blob');

  const entries: Entry[] = [];
  let cursor: string | undefined;
  do {
    const res = await list({ cursor, limit: 1000, token: process.env.BLOB_READ_WRITE_TOKEN });
    for (const b of res.blobs) {
      entries.push({ key: b.pathname, size: b.size, lastModified: b.uploadedAt?.toISOString() });
    }
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);

  return entries;
}

function resolveOutDir(): string {
  const root = process.env.BACKUP_DIR ?? join(__dirname, '..', '..', 'backup');
  if (process.env.BACKUP_TIMESTAMP) return join(root, process.env.BACKUP_TIMESTAMP);

  const last = join(root, '.last');
  if (existsSync(last)) {
    const dir = readFileSync(last, 'utf8').trim();
    if (dir && existsSync(dir)) return dir;
  }
  return join(root, new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z');
}

async function main() {
  const [r2, blob] = await Promise.all([listR2(), listVercelBlob()]);

  if (r2 === null && blob === null) {
    console.error('✖ Không có credential của R2 lẫn Vercel Blob — không kê được kho ảnh.');
    process.exit(1);
  }

  const outDir = resolveOutDir();
  mkdirSync(outDir, { recursive: true });

  const sum = (e: Entry[] | null) => (e ?? []).reduce((acc, x) => acc + x.size, 0);
  const manifest = {
    generated_at: new Date().toISOString(),
    active_provider: process.env.STORAGE_PROVIDER ?? 'vercel-blob',
    r2: r2 && { bucket: process.env.R2_BUCKET_NAME, count: r2.length, bytes: sum(r2), objects: r2 },
    vercel_blob: blob && { count: blob.length, bytes: sum(blob), objects: blob },
  };
  writeFileSync(join(outDir, 'storage-manifest.json'), JSON.stringify(manifest, null, 2));

  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  if (r2) console.log(`✔ R2: ${r2.length} object, ${mb(sum(r2))} MB`);
  if (blob) console.log(`✔ Vercel Blob: ${blob.length} object, ${mb(sum(blob))} MB`);
  console.log(`→ ${outDir}/storage-manifest.json`);
}

main().catch((error) => {
  console.error(`✖ ${(error as Error).message}`);
  process.exit(1);
});

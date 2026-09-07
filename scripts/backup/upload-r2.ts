/**
 * Đẩy một thư mục backup lên bucket backup trên R2.
 *
 * Dùng @aws-sdk/client-s3 (đã là dependency của repo) thay vì AWS CLI để local
 * và CI chạy y hệt nhau — máy dev thường không có `aws`, và AWS CLI v2 còn cần
 * tắt checksum mới nói chuyện được với R2.
 *
 *   pnpm backup:upload                          # thư mục mới nhất, tier daily
 *   BACKUP_TIER=monthly pnpm backup:upload
 *   pnpm backup:upload <thư mục>
 *   pnpm backup:upload --put <file> <key>       # một file lẻ
 *   pnpm backup:upload --get <key> <file>       # tải một file lẻ về
 */
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, createReadStream } from 'fs';
import { join, basename } from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

function resolveDir(): string {
  const arg = process.argv[2];
  if (arg) return arg;

  const root = process.env.BACKUP_DIR ?? join(__dirname, '..', '..', 'backup');
  if (process.env.BACKUP_TIMESTAMP) return join(root, process.env.BACKUP_TIMESTAMP);

  const last = join(root, '.last');
  if (existsSync(last)) return readFileSync(last, 'utf8').trim();
  throw new Error('Không tìm thấy thư mục backup.');
}

/** Ngày 1 → monthly, Chủ nhật → weekly, còn lại → daily (khớp lifecycle rule trên R2). */
function resolveTier(): string {
  if (process.env.BACKUP_TIER) return process.env.BACKUP_TIER;
  const now = new Date();
  if (now.getUTCDate() === 1) return 'monthly';
  if (now.getUTCDay() === 0) return 'weekly';
  return 'daily';
}

function makeClient(): { client: S3Client; bucket: string } {
  const { R2_ACCOUNT_ID, R2_BACKUP_BUCKET, R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY } =
    process.env;
  if (!R2_ACCOUNT_ID || !R2_BACKUP_BUCKET || !R2_BACKUP_ACCESS_KEY_ID || !R2_BACKUP_SECRET_ACCESS_KEY) {
    console.error('✖ Thiếu R2_ACCOUNT_ID / R2_BACKUP_BUCKET / R2_BACKUP_ACCESS_KEY_ID / R2_BACKUP_SECRET_ACCESS_KEY.');
    process.exit(1);
  }
  return {
    bucket: R2_BACKUP_BUCKET,
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_BACKUP_ACCESS_KEY_ID,
        secretAccessKey: R2_BACKUP_SECRET_ACCESS_KEY,
      },
    }),
  };
}

async function main() {
  const { client, bucket } = makeClient();

  // Chế độ một file lẻ — dùng cho latest-counts.json trong workflow verify.
  if (process.argv[2] === '--put' || process.argv[2] === '--get') {
    const [mode, a, b] = process.argv.slice(2);
    if (mode === '--put') {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: b, Body: readFileSync(a) }),
      );
      console.log(`✔ ↑ s3://${bucket}/${b}`);
    } else {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: a }));
      writeFileSync(b, Buffer.from(await res.Body!.transformToByteArray()));
      console.log(`✔ ↓ s3://${bucket}/${a} → ${b}`);
    }
    return;
  }

  const dir = resolveDir();
  const files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile());

  // Chặn đẩy nhầm bản chưa mã hoá lên R2 — dump chứa PII và password hash.
  const naked = files.filter((f) => !f.endsWith('.gpg') && f !== 'counts.json');
  if (naked.length > 0) {
    console.error(`✖ Còn file chưa mã hoá: ${naked.join(', ')}. Chạy \`pnpm backup:seal\` trước.`);
    process.exit(1);
  }

  const prefix = `db/${resolveTier()}/${basename(dir)}`;
  for (const f of files) {
    const path = join(dir, f);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${prefix}/${f}`,
        Body: createReadStream(path),
        ContentLength: statSync(path).size,
      }),
    );
    console.log(`  ↑ ${prefix}/${f} (${(statSync(path).size / 1024).toFixed(0)} KB)`);
  }

  console.log(`✔ Đã đẩy ${files.length} file lên s3://${bucket}/${prefix}/`);
}

main().catch((error) => {
  console.error(`✖ ${(error as Error).message}`);
  process.exit(1);
});

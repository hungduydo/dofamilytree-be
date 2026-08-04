/**
 * Backfill `members.generation` cho toàn bộ thành viên.
 *
 * Dùng chung đúng `computeGenerations` mà job nền `generation-recompute` dùng,
 * nên kết quả giống hệt — script này chỉ khác ở chỗ chạy từ máy local với
 * DIRECT_URL nên không bị trần maxDuration 10s của Vercel, và in được phân bố
 * trước khi ghi.
 *
 * Chạy MỘT LẦN sau khi đã áp prisma/manual-migrations/001_add_member_generation.sql,
 * và TRƯỚC khi các read path (stats, chart) bắt đầu đọc cột này.
 *
 * Usage:
 *   pnpm backfill:generations -- --dry-run    # chỉ in phân bố, không ghi
 *   pnpm backfill:generations
 */

import { PrismaClient } from '@prisma/client';
import { computeGenerations } from '../src/generation/generation.algorithm';

const prisma = new PrismaClient();

const PERSIST_CHUNK = 5_000;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Backfilling member generations${dryRun ? ' (DRY RUN — không ghi gì)' : ''}...`);

  const [members, edges, pinRows] = await Promise.all([
    prisma.member.findMany({ select: { id: true, name: true } }),
    prisma.memberRelationship.findMany({ select: { parent_id: true, child_id: true, type: true } }),
    prisma.profile.findMany({
      where: { generation: { not: null } },
      select: { member_id: true, generation: true },
    }),
  ]);

  console.log(
    `Đã tải ${members.length} thành viên, ${edges.length} quan hệ, ${pinRows.length} giá trị nhập tay.`,
  );

  const { generations, warnings } = computeGenerations({
    memberIds: members.map((m) => m.id),
    parentEdges: edges.filter((e) => e.type !== 'SPOUSE'),
    spouseEdges: edges.filter((e) => e.type === 'SPOUSE'),
    pins: new Map(pinRows.map((p) => [p.member_id, p.generation as number])),
  });

  // Phân bố — nhìn vào đây để phát hiện dữ liệu sai trước khi ghi. Một "thế hệ 1"
  // phình to bất thường thường nghĩa là thiếu cạnh cha-con ở đâu đó.
  const distribution = new Map<number, number>();
  for (const g of generations.values()) distribution.set(g, (distribution.get(g) ?? 0) + 1);

  console.log('\nPhân bố thế hệ:');
  for (const g of [...distribution.keys()].sort((a, b) => a - b)) {
    console.log(`  thế hệ ${String(g).padStart(3)}: ${distribution.get(g)} thành viên`);
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} cảnh báo:`);
    for (const w of warnings) console.log(`  - ${w}`);
  }

  if (dryRun) {
    console.log('\nDry run — không ghi gì. Bỏ --dry-run để áp dụng.');
    return;
  }

  const ids = [...generations.keys()];
  let updated = 0;
  for (let i = 0; i < ids.length; i += PERSIST_CHUNK) {
    const idChunk = ids.slice(i, i + PERSIST_CHUNK);
    const genChunk = idChunk.map((id) => generations.get(id) as number);
    updated += await prisma.$executeRaw`
      UPDATE members AS m
      SET generation = v.gen, generation_updated_at = NOW()
      FROM (
        SELECT UNNEST(${idChunk}::uuid[]) AS id,
               UNNEST(${genChunk}::int[]) AS gen
      ) AS v
      WHERE m.id = v.id
        AND m.generation IS DISTINCT FROM v.gen
    `;
  }

  console.log(`\n✅ Xong. ${updated}/${members.length} dòng đã cập nhật.`);
  console.log('Nhớ xoá cache: POST /v2/tree/regenerate (hoặc chờ TTL 1h).');
}

main()
  .catch((e) => {
    console.error('Backfill thất bại:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

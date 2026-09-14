/**
 * Backfill `members.life_status` cho dữ liệu cũ.
 *
 * Quy tắc (đã chốt với dòng họ) — member đang UNKNOWN chuyển sang DECEASED nếu:
 *   1. có ngày mất thật (không null, không chuỗi rỗng/khoảng trắng), HOẶC
 *   2. thuộc đời 1–13 (members.generation, giá trị hiệu lực), HOẶC
 *   3. sinh cách đây hơn 110 năm.
 * Còn lại (không xác định được là đã mất) → ALIVE. Admin sửa lại từng người nếu
 * sai (lọc bằng GET /v2/members?lifeStatus=ALIVE).
 *
 * CHỈ ghi member đang UNKNOWN ⇒ chạy lại an toàn, không đè giá trị admin đã sửa.
 * Chạy SAU 008_member_life_status.sql và SAU khi generation đã backfill.
 *
 * Usage:
 *   pnpm backfill:life-status -- --dry-run    # chỉ in, không ghi
 *   pnpm backfill:life-status
 */

import { PrismaClient } from '@prisma/client';
import { deriveLifeStatus, LifeStatusReason } from '../src/members/life-status';

const prisma = new PrismaClient();

const ANCESTOR_MAX_GENERATION = 13;
const PERSIST_CHUNK = 5_000;

const REASON_LABEL: Record<Exclude<LifeStatusReason, null>, string> = {
  deathDate: 'có ngày mất',
  generation: `đời ≤ ${ANCESTOR_MAX_GENERATION}`,
  age: 'sinh quá 110 năm',
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Backfilling member life_status${dryRun ? ' (DRY RUN — không ghi gì)' : ''}...`);

  const members = await prisma.member.findMany({
    select: { id: true, name: true, birthDate: true, deathDate: true, generation: true, lifeStatus: true },
    orderBy: [{ generation: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
  });

  const before = new Map<string, number>();
  for (const m of members) before.set(m.lifeStatus, (before.get(m.lifeStatus) ?? 0) + 1);
  console.log(`Đã tải ${members.length} thành viên. Hiện tại:`, Object.fromEntries(before));

  const now = new Date();
  const toDeceased: string[] = [];
  const toAlive: typeof members = [];
  const byReason = new Map<string, typeof members>();

  for (const m of members) {
    if (m.lifeStatus !== 'UNKNOWN') continue;
    const { status, reason } = deriveLifeStatus(m, { now, ancestorMaxGeneration: ANCESTOR_MAX_GENERATION });
    if (status !== 'DECEASED' || !reason) {
      toAlive.push(m);
      continue;
    }
    toDeceased.push(m.id);
    const list = byReason.get(reason) ?? [];
    list.push(m);
    byReason.set(reason, list);
  }

  for (const [reason, list] of byReason) {
    console.log(`\n→ DECEASED vì ${REASON_LABEL[reason as keyof typeof REASON_LABEL]}: ${list.length}`);
    for (const m of list) {
      console.log(
        `  - đời ${String(m.generation ?? '?').padStart(3)} | ${m.name} | sinh: ${m.birthDate || '—'} | mất: ${m.deathDate || '—'}`,
      );
    }
  }

  console.log(`\n→ ALIVE (không xác định được là đã mất): ${toAlive.length}`);
  for (const m of toAlive) {
    console.log(
      `  - đời ${String(m.generation ?? '?').padStart(3)} | ${m.name} | sinh: ${m.birthDate || '—'}`,
    );
  }

  console.log(`\nTổng: ${toDeceased.length} → DECEASED, ${toAlive.length} → ALIVE.`);

  if (dryRun) {
    console.log('\nDry run — không ghi gì. Bỏ --dry-run để áp dụng.');
    return;
  }

  let updated = 0;
  const aliveIds = toAlive.map((m) => m.id);
  for (const [ids, lifeStatus] of [
    [toDeceased, 'DECEASED'],
    [aliveIds, 'ALIVE'],
  ] as const) {
    for (let i = 0; i < ids.length; i += PERSIST_CHUNK) {
      // Điều kiện lifeStatus: 'UNKNOWN' chặn đè giá trị admin vừa sửa trong lúc script chạy.
      const { count } = await prisma.member.updateMany({
        where: { id: { in: ids.slice(i, i + PERSIST_CHUNK) }, lifeStatus: 'UNKNOWN' },
        data: { lifeStatus },
      });
      updated += count;
    }
  }

  console.log(`\n✅ Xong. ${updated} dòng đã cập nhật.`);
  console.log(
    'Nhớ xoá cache (hoặc chờ TTL): tree:stats, tree:chart:full, members:stats, memorial:* — ' +
      'POST /v2/tree/regenerate xoá được phần tree.',
  );
}

main()
  .catch((e) => {
    console.error('Backfill thất bại:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

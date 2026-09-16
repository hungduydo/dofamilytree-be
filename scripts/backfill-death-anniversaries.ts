/**
 * Backfill ngày kỵ (anniversaries.kind = 'DEATH') từ tiểu sử nhập khẩu.
 *
 * Gia phả gốc ghi ngày kỵ trong ghi chú dạng "Kỵ: 23.12 Âm lịch";
 * restore-from-import-json.ts chép nguyên ghi chú vào profiles.biography nhưng
 * không lưu ngày kỵ vào cột nào. Script này đọc lại và tạo ngày kỵ âm lịch.
 *
 * Chỉ tạo cho người ĐANG DECEASED và CHƯA có ngày kỵ ⇒ chạy lại an toàn, không
 * đè ngày kỵ admin đã nhập. Chạy SAU 009_anniversary_recurring.sql.
 *
 * Usage:
 *   pnpm backfill:death-anniversaries              # dry-run: chỉ in
 *   pnpm backfill:death-anniversaries -- --apply   # ghi
 */

import { PrismaClient } from '@prisma/client';
import { parseDeathAnniversaryNote } from '../src/events/anniversary-occurrence';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`Backfill ngày kỵ từ tiểu sử${apply ? '' : ' (DRY RUN — thêm --apply để ghi)'}...`);

  const profiles = await prisma.profile.findMany({
    where: { biography: { contains: 'Kỵ' } },
    select: {
      biography: true,
      member: {
        select: {
          id: true, name: true, generation: true, lifeStatus: true,
          anniversaries: { where: { kind: 'DEATH' }, select: { id: true } },
        },
      },
    },
    orderBy: { member: { generation: { sort: 'asc', nulls: 'last' } } },
  });

  const toCreate: { member_id: string; day: number; month: number; isLeapMonth: boolean }[] = [];
  const unreadable: string[] = [];
  const notDeceased: string[] = [];
  let alreadyHas = 0;

  for (const { biography, member } of profiles) {
    const label = `đời ${String(member.generation ?? '?').padStart(3)} | ${member.name}`;
    if (member.anniversaries.length) {
      alreadyHas++;
      continue;
    }
    const parsed = parseDeathAnniversaryNote(biography);
    if (!parsed) {
      const line = biography?.match(/Kỵ:[^.\n]{0,40}/)?.[0] ?? '';
      unreadable.push(`${label} | "${line}"`);
      continue;
    }
    if (member.lifeStatus !== 'DECEASED') {
      notDeceased.push(`${label} | trạng thái ${member.lifeStatus}`);
      continue;
    }
    toCreate.push({ member_id: member.id, ...parsed });
    console.log(`  + ${label} | ${parsed.day}/${parsed.month}${parsed.isLeapMonth ? ' nhuận' : ''} ÂL`);
  }

  console.log(`\nTiểu sử có chữ "Kỵ": ${profiles.length}`);
  console.log(`  sẽ tạo           : ${toCreate.length}`);
  console.log(`  đã có ngày kỵ    : ${alreadyHas}`);
  console.log(`  không đọc được   : ${unreadable.length}`);
  for (const line of unreadable) console.log(`    - ${line}`);
  console.log(`  chưa ở DECEASED  : ${notDeceased.length} (sửa trạng thái rồi chạy lại)`);
  for (const line of notDeceased) console.log(`    - ${line}`);

  if (!apply) return;

  // skipDuplicates: unique index anniversaries_death_member_uidx chặn trùng nếu admin vừa nhập.
  const { count } = await prisma.anniversary.createMany({
    data: toCreate.map((a) => ({ ...a, kind: 'DEATH', calendar: 'LUNAR' })),
    skipDuplicates: true,
  });
  console.log(`\n✅ Đã tạo ${count} ngày kỵ.`);
}

main()
  .catch((e) => {
    console.error('Backfill thất bại:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

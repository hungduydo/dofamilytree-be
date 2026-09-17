/**
 * Backfill mộ phần (bảng cemeteries) từ tiểu sử nhập khẩu.
 *
 * Gia phả gốc ghi nơi an táng trong ghi chú dạng "Mộ: Đùng Vành.";
 * restore-from-import-json.ts chép nguyên ghi chú vào profiles.biography nhưng
 * không tạo mộ. Script này tạo mỗi người một mộ:
 *   name      = "Mộ <tên>"
 *   member_id = người đó
 *   area_id   = khu "Đùng Vành" trong grave_areas (tạo nếu chưa có)
 * Ngày mất không chép: giao diện tự lấy từ thành viên. Mộ mới KHÔNG có toạ độ:
 * vị trí hiển thị lấy tâm khu cho tới khi có người chấm tại mộ.
 *
 * Khu mộ (010_grave_areas.sql): mộ đã có mà khu còn nằm trong description
 * (lần chạy trước, hoặc nhập tay) được chuyển sang area_id, description bị xoá.
 * Nếu toạ độ của mộ trùng toạ độ khu trong file thì đó là toạ độ chép từ khu —
 * bị xoá luôn. Với `--areas <file>`, khu mới hoặc khu chưa vẽ nhận một ô vuông
 * nhỏ quanh toạ độ trong file; admin vẽ ranh giới thật ở BO → Khu vực mộ.
 * Khu đã có polygon và mộ đã có khu không bao giờ bị đổi.
 *
 * Ngoài ra, ngày kỵ (anniversaries.kind = 'DEATH') chưa gắn mộ sẽ được gắn vào
 * mộ vừa tạo.
 *
 * Chỉ tạo cho người ĐANG DECEASED và CHƯA có mộ nào ⇒ chạy lại an toàn, không
 * đè mộ admin đã nhập.
 *
 * Usage:
 *   pnpm backfill:graves                                                    # dry-run
 *   pnpm backfill:graves -- --apply --areas scripts/data/grave-areas.json   # ghi
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { AreaCoordinates, areaKey, parseAreaCoordinates, planAreaBackfill } from '../src/graves/grave-areas';
import { graveNameFor, parseGraveNote } from '../src/graves/grave-note';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');
  const areasFlag = process.argv.indexOf('--areas');
  const areasPath = areasFlag === -1 ? null : process.argv[areasFlag + 1];
  if (areasFlag !== -1 && !areasPath) throw new Error('--areas cần đường dẫn file JSON');
  const areas: AreaCoordinates = areasPath
    ? parseAreaCoordinates(JSON.parse(readFileSync(areasPath, 'utf-8')))
    : new Map();
  const coordsFor = (place: string) => areas.get(areaKey(place)) ?? null;

  console.log(`Backfill mộ phần từ tiểu sử${apply ? '' : ' (DRY RUN — thêm --apply để ghi)'}...`);
  if (areasPath) console.log(`Toạ độ khu mộ: ${areas.size} khu từ ${areasPath}`);

  const profiles = await prisma.profile.findMany({
    where: { biography: { contains: 'Mộ' } },
    select: {
      biography: true,
      member: {
        select: {
          id: true, name: true, generation: true, lifeStatus: true,
          cemeteries: { select: { id: true } },
        },
      },
    },
    orderBy: { member: { generation: { sort: 'asc', nulls: 'last' } } },
  });

  type NewGrave = { member_id: string; name: string; place: string };
  const toCreate: NewGrave[] = [];
  const byPlace = new Map<string, number>();
  const unknown: string[] = [];
  const noLabel: string[] = [];
  const notDeceased: string[] = [];
  let alreadyHas = 0;

  for (const { biography, member } of profiles) {
    const label = `đời ${String(member.generation ?? '?').padStart(3)} | ${member.name}`;
    if (member.cemeteries.length) {
      alreadyHas++;
      continue;
    }
    const parsed = parseGraveNote(biography);
    if (parsed === null) {
      noLabel.push(label);
      continue;
    }
    if (parsed === 'unknown') {
      unknown.push(label);
      continue;
    }
    if (member.lifeStatus !== 'DECEASED') {
      notDeceased.push(`${label} | ${parsed.place} | trạng thái ${member.lifeStatus}`);
      continue;
    }
    const coords = coordsFor(parsed.place);
    toCreate.push({ member_id: member.id, name: graveNameFor(member.name), place: parsed.place });
    byPlace.set(parsed.place, (byPlace.get(parsed.place) ?? 0) + 1);
    console.log(`  + ${label} | ${parsed.place}${coords ? ' 📍' : ''}`);
  }

  console.log(`\nTiểu sử có chữ "Mộ": ${profiles.length}`);
  console.log(`  sẽ tạo           : ${toCreate.length} (khu có toạ độ: ${toCreate.filter((g) => coordsFor(g.place)).length})`);
  for (const [place, count] of [...byPlace].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(3)} × ${place}${coordsFor(place) ? '  📍' : ''}`);
  }
  console.log(`  đã có mộ         : ${alreadyHas}`);
  console.log(`  ghi "không rõ"   : ${unknown.length}`);
  console.log(`  không có "Mộ:"   : ${noLabel.length}`);
  for (const line of noLabel) console.log(`    - ${line}`);
  console.log(`  chưa ở DECEASED  : ${notDeceased.length} (sửa trạng thái rồi chạy lại)`);
  for (const line of notDeceased) console.log(`    - ${line}`);

  // Mộ sắp tạo được lập kế hoạch như mộ có sẵn mang description = địa danh, để
  // khu của chúng được tạo cùng một lượt.
  const existingGraves = await prisma.cemetery.findMany({
    where: { area_id: null, description: { not: null } },
    select: { id: true, name: true, description: true, area_id: true, latitude: true, longitude: true },
  });
  const pending = toCreate.map((g) => ({
    id: `new:${g.member_id}`, name: g.name, description: g.place, area_id: null, latitude: null, longitude: null,
  }));
  const plan = planAreaBackfill(
    [...existingGraves, ...pending],
    await prisma.graveArea.findMany({ select: { id: true, name: true, polygon: true } }),
    areas,
  );
  const existingAssign = plan.assign.filter((a) => !a.grave.id.startsWith('new:'));

  console.log(`\nKhu mộ sẽ tạo: ${plan.create.length}`);
  for (const a of plan.create) console.log(`    + ${a.name}${a.polygon ? '  📍 (ô vuông tạm)' : '  (chưa có ranh giới)'}`);
  const missingAreas = plan.create.filter((a) => !a.polygon);
  if (missingAreas.length) {
    console.log(`  ${missingAreas.length} khu chưa có toạ độ — vẽ ranh giới ở BO → Khu vực mộ, hoặc điền file --areas rồi chạy lại.`);
  }
  console.log(`Khu có sẵn được vẽ ô vuông tạm: ${plan.draw.length}`);
  for (const a of plan.draw) console.log(`    📍 ${a.name}`);
  console.log(`Mộ có sẵn được gắn khu (description → area_id): ${existingAssign.length}`);
  for (const a of existingAssign) {
    console.log(`    → ${a.grave.name} | ${a.grave.description}${a.clearCoordinates ? ' | xoá toạ độ chép từ khu' : ''}`);
  }

  if (!apply) return;

  const areaIds = new Map<string, string>(
    (await prisma.graveArea.findMany({ select: { id: true, name: true } })).map((a) => [areaKey(a.name), a.id]),
  );
  for (const a of plan.create) {
    const row = await prisma.graveArea.upsert({
      where: { name: a.name },
      update: {},
      create: { name: a.name, polygon: a.polygon ?? Prisma.DbNull },
    });
    areaIds.set(a.key, row.id);
  }
  // `polygon: DbNull` trong where: không đè ranh giới ai đó vừa vẽ trong lúc script chạy.
  for (const a of plan.draw) {
    await prisma.graveArea.updateMany({ where: { id: a.id, polygon: { equals: Prisma.DbNull } }, data: { polygon: a.polygon } });
  }

  let assigned = 0;
  for (const a of existingAssign) {
    // area_id: null trong where chặn việc đè khu admin vừa chọn.
    const { count } = await prisma.cemetery.updateMany({
      where: { id: a.grave.id, area_id: null },
      data: {
        area_id: areaIds.get(a.key),
        description: null,
        ...(a.clearCoordinates ? { latitude: null, longitude: null } : {}),
      },
    });
    assigned += count;
  }

  let created = 0;
  let linked = 0;
  // Từng người một trong transaction: kiểm lại "chưa có mộ" ngay lúc ghi, vì
  // bảng không có ràng buộc unique theo member (một người có thể có nhiều mộ).
  for (const grave of toCreate) {
    await prisma.$transaction(async (tx) => {
      const exists = await tx.cemetery.count({ where: { member_id: grave.member_id } });
      if (exists) return;
      const row = await tx.cemetery.create({
        data: { member_id: grave.member_id, name: grave.name, area_id: areaIds.get(areaKey(grave.place)) },
      });
      created++;
      const { count } = await tx.anniversary.updateMany({
        where: { member_id: grave.member_id, kind: 'DEATH', cemetery_id: null },
        data: { cemetery_id: row.id },
      });
      linked += count;
    });
  }
  console.log(
    `\n✅ Đã tạo ${plan.create.length} khu, vẽ tạm ${plan.draw.length} khu, tạo ${created} mộ, gắn ${linked} ngày kỵ vào mộ, gắn khu cho ${assigned} mộ có sẵn.`,
  );
}

main()
  .catch((e) => {
    console.error('Backfill thất bại:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

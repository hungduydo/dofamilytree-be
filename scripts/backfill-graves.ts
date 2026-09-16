/**
 * Backfill mộ phần (bảng cemeteries) từ tiểu sử nhập khẩu.
 *
 * Gia phả gốc ghi nơi an táng trong ghi chú dạng "Mộ: Đùng Vành.";
 * restore-from-import-json.ts chép nguyên ghi chú vào profiles.biography nhưng
 * không tạo mộ. Script này tạo mỗi người một mộ:
 *   name        = "Mộ <tên>"
 *   description = địa danh ("Đùng Vành")
 *   member_id   = người đó
 * Ngày mất không chép: giao diện tự lấy từ thành viên.
 *
 * Toạ độ: với `--areas <file>` (mặc định scripts/data/grave-areas.json), mộ ở
 * khu đã có toạ độ nhận toạ độ của KHU (gps_precision = 'AREA'). Chạy lại được:
 * điền thêm khu → mộ chưa có toạ độ được bổ sung; sửa toạ độ một khu → các mộ
 * AREA của khu đó đổi theo. Mộ đã chấm tại mộ (EXACT) không bao giờ bị đè.
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

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { AreaCoordinates, areaKey, parseAreaCoordinates, planAreaUpdates } from '../src/graves/grave-areas';
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

  type NewGrave = {
    member_id: string; name: string; description: string;
    latitude: number | null; longitude: number | null; gpsPrecision: 'AREA' | null;
  };
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
    toCreate.push({
      member_id: member.id,
      name: graveNameFor(member.name),
      description: parsed.place,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      gpsPrecision: coords ? 'AREA' : null,
    });
    byPlace.set(parsed.place, (byPlace.get(parsed.place) ?? 0) + 1);
    console.log(`  + ${label} | ${parsed.place}${coords ? ' 📍' : ''}`);
  }

  console.log(`\nTiểu sử có chữ "Mộ": ${profiles.length}`);
  console.log(`  sẽ tạo           : ${toCreate.length} (có toạ độ khu: ${toCreate.filter((g) => g.gpsPrecision).length})`);
  for (const [place, count] of [...byPlace].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(3)} × ${place}${coordsFor(place) ? '  📍' : ''}`);
  }
  const missingAreas = [...byPlace.keys()].filter((place) => !coordsFor(place));
  if (missingAreas.length) {
    console.log(`  khu CHƯA có toạ độ (${missingAreas.length}) — mộ vẫn được tạo, điền toạ độ vào file --areas rồi chạy lại:`);
    for (const place of missingAreas) console.log(`    - ${place}`);
  }
  console.log(`  đã có mộ         : ${alreadyHas}`);
  console.log(`  ghi "không rõ"   : ${unknown.length}`);
  console.log(`  không có "Mộ:"   : ${noLabel.length}`);
  for (const line of noLabel) console.log(`    - ${line}`);
  console.log(`  chưa ở DECEASED  : ${notDeceased.length} (sửa trạng thái rồi chạy lại)`);
  for (const line of notDeceased) console.log(`    - ${line}`);

  // Mộ đã có (lần chạy trước hoặc nhập tay): gắn toạ độ khu cho mộ chưa có toạ độ,
  // và cập nhật mộ AREA khi toạ độ khu trong file đã đổi. Không đụng mộ EXACT.
  const areaUpdates = areas.size
    ? planAreaUpdates(
        await prisma.cemetery.findMany({
          where: { description: { not: null }, OR: [{ latitude: null }, { gpsPrecision: 'AREA' }] },
          select: { id: true, name: true, description: true, latitude: true, longitude: true, gpsPrecision: true },
        }),
        areas,
      )
    : [];
  const fills = areaUpdates.filter((u) => u.action === 'fill');
  const moves = areaUpdates.filter((u) => u.action === 'move');
  console.log(`  mộ có sẵn được gắn toạ độ khu   : ${fills.length}`);
  for (const u of fills) console.log(`    📍 ${u.name} | ${u.description}`);
  console.log(`  mộ có sẵn đổi theo toạ độ khu mới: ${moves.length}`);
  for (const u of moves) {
    console.log(`    ↪ ${u.name} | ${u.description} | ${u.latitude}, ${u.longitude} → ${u.next.latitude}, ${u.next.longitude}`);
  }

  if (!apply) return;

  let filled = 0;
  let moved = 0;
  for (const u of areaUpdates) {
    // Điều kiện trong where chặn việc đè toạ độ ai đó vừa chấm tại mộ trong lúc script chạy.
    const { count } = await prisma.cemetery.updateMany({
      where:
        u.action === 'fill'
          ? { id: u.id, latitude: null }
          : { id: u.id, gpsPrecision: 'AREA', latitude: u.latitude, longitude: u.longitude },
      data: { latitude: u.next.latitude, longitude: u.next.longitude, gpsPrecision: 'AREA' },
    });
    if (u.action === 'fill') filled += count;
    else moved += count;
  }

  let created = 0;
  let linked = 0;
  // Từng người một trong transaction: kiểm lại "chưa có mộ" ngay lúc ghi, vì
  // bảng không có ràng buộc unique theo member (một người có thể có nhiều mộ).
  for (const grave of toCreate) {
    await prisma.$transaction(async (tx) => {
      const exists = await tx.cemetery.count({ where: { member_id: grave.member_id } });
      if (exists) return;
      const row = await tx.cemetery.create({ data: grave });
      created++;
      const { count } = await tx.anniversary.updateMany({
        where: { member_id: grave.member_id, kind: 'DEATH', cemetery_id: null },
        data: { cemetery_id: row.id },
      });
      linked += count;
    });
  }
  console.log(`\n✅ Đã tạo ${created} mộ, gắn ${linked} ngày kỵ vào mộ, gắn toạ độ khu cho ${filled} mộ có sẵn, cập nhật ${moved} mộ theo toạ độ khu mới.`);
}

main()
  .catch((e) => {
    console.error('Backfill thất bại:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

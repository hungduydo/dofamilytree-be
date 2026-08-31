/**
 * Tái tạo members + cây quan hệ từ bộ JSON gia phả gốc.
 *
 * BỐI CẢNH: ngày 31/08/2026 một lần chạy `prisma migrate dev` đã reset schema
 * `public` và xoá sạch dữ liệu. Tài khoản Supabase ở gói free nên không có
 * backup. Bộ `dofamilytree/backend/import_json/` là nguồn đã dùng để nhập liệu
 * lần đầu, và là thứ duy nhất tái tạo lại được danh sách người + quan hệ.
 *
 * Cách chạy:
 *   pnpm exec ts-node scripts/restore-from-import-json.ts            # chạy thử
 *   pnpm exec ts-node scripts/restore-from-import-json.ts --apply    # ghi thật
 *
 * CẤU TRÚC NGUỒN
 *   D{n}.json  = đời n-1 (D1 → generation 0). Mỗi bản ghi là một người thuộc
 *                dòng nam, id dạng `T{gen}-1xxxx`.
 *   .spouses[] = vợ, id dạng `T{gen}-2xxxx`, CÙNG đời với chồng.
 *   .children[] = con, KHÔNG có id. Phần lớn trùng với một bản ghi top-level ở
 *                đời sau (khớp theo tên + tập parents); số còn lại là người chỉ
 *                tồn tại ở đây (con gái, hoặc nhánh dừng lại).
 *
 * ĐỜI được lấy từ CẤU TRÚC FILE chứ không suy ra từ quan hệ. Mô hình này đã
 * đối chiếu khớp với 5 dòng thật đọc được từ DB trước khi mất: Đỗ Thiện My (0),
 * Đỗ Đức Mẫn (1), Đỗ Khắc Cầm (7), Đỗ Khắc Thiêm (13), Lương Thị Sáo (14).
 */
import { PrismaClient, RelationshipNatureType } from '@prisma/client';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { removeVietnameseTones } from '../src/utils/vietnamese-helper';

const IMPORT_DIR =
  process.env.IMPORT_DIR ??
  join(__dirname, '../../dofamilytree/backend/import_json');

/**
 * UUID đọc được từ DB CŨ trước khi mất, cho những người xác định chắc chắn.
 * Giữ nguyên id để avatar trên Vercel Blob (đường dẫn `avatars/{memberId}/…`)
 * và mọi liên kết ngoài vẫn trỏ đúng người.
 */
const KNOWN_IDS: Record<string, string> = {
  'T0-10001': 'f02be271-158b-4a19-8268-2e3b5743fa45', // Đỗ Thiện My — có avatar
  'T1-10001': '2a490dbd-d0c5-4f02-9c8a-a45298999b20', // Đỗ Đức Mẫn
  'T7-10001': '4be9e889-b900-49f0-bba6-fb66bbfe4c55', // Đỗ Khắc Cầm
  'T13-10011': 'a1ec7903-ea22-43cd-876c-997be3e6714b', // Đỗ Khắc Thiêm — có avatar
  'T14-20006': '9c9fa4a0-b641-4390-a86b-ddd25e090f68', // Lương Thị Sáo
};

/**
 * Ngày tháng đọc được từ DB cũ, CHÍNH XÁC HƠN file nguồn (file chỉ có năm).
 * Ai đó đã sửa tay qua app sau lần nhập đầu; giữ lại bản chi tiết hơn.
 */
const KNOWN_DATES: Record<string, { birthDate?: string; deathDate?: string }> = {
  'T13-10011': { birthDate: '1903-01-01', deathDate: '1971-11-13' },
};


/**
 * Bóc dữ liệu có cấu trúc ra khỏi `note`.
 *
 * `note` là văn xuôi gia phả, KHÔNG phải bản ghi có trường. Nó trộn nhiều thứ
 * trong một câu ("Sinh năm 1946. Chồng là Cao Trà làng Hậu Kiên, Triệu Phong,
 * Quảng Trị. Địa chỉ: Thị xã Đồng Xoài, Bình Phước."), nên mỗi mẫu dưới đây
 * được chọn theo hướng THÀ BỎ SÓT CÒN HƠN LẤY SAI — note gốc vẫn giữ nguyên
 * trong `biography`, nên bỏ sót không mất thông tin, còn lấy sai thì bịa ra dữ
 * liệu không có thật.
 */
function extractFromNote(note: string | null) {
  const out: {
    birthYear?: string; deathYear?: string;
    address?: string; occupation?: string;
    grave?: string; deathAnniversary?: string;
  } = {};
  if (!note) return out;

  const YEAR = String.raw`1[7-9]\d{2}|20\d{2}`;

  // ── Năm sinh / năm mất ────────────────────────────────────────────────────
  // Gia phả ghi ngày theo ÂM LỊCH và kèm năm dương trong ngoặc:
  // "Từ trần ngày 16.8.Tân Tỵ (2001)". Bản trước dùng [^.\n] để giới hạn trong
  // một câu, nhưng chính ngày âm lịch lại đầy dấu chấm nên mẫu đó khớp ĐÚNG 0
  // note. Vì vậy ở đây cho phép vượt dấu chấm, và đổi lại siết bằng cách BẮT
  // BUỘC năm phải nằm trong ngoặc đơn — đó mới là quy ước của tài liệu, và
  // ngoặc đơn ngăn việc vơ nhầm một năm bất kỳ ở câu bên cạnh.
  const range = note.match(new RegExp(String.raw`\b(${YEAR})\s*[–—-]\s*(${YEAR})\b`));
  if (range) {
    // Dạng "Giáp Thìn 1964 – 1996" = sinh – mất.
    out.birthYear = range[1];
    out.deathYear = range[2];
  }

  if (!out.birthYear) {
    const m =
      note.match(new RegExp(String.raw`[Ss]inh[^\n]{0,40}?\((${YEAR})\)`)) ??
      note.match(new RegExp(String.raw`[Ss]inh(?:\s+năm)?\s+(${YEAR})\b`));
    if (m) out.birthYear = m[1];
  }

  if (!out.deathYear) {
    const m =
      note.match(
        new RegExp(String.raw`(?:Từ trần|từ trần|[Mm]ất|[Hh]y sinh|[Qq]ua đời|[Tt]ạ thế)[^\n]{0,50}?\((${YEAR})\)`),
      ) ??
      // Không có ngoặc thì phải đứng SÁT động từ. CỐ Ý bỏ "mất" khỏi nhánh này:
      // "mất" còn nghĩa khác ("mất liên lạc", "thất lạc"), không đủ chắc.
      note.match(
        new RegExp(String.raw`(?:Từ trần|từ trần|[Hh]y sinh|[Qq]ua đời|[Tt]ạ thế)\s+(?:năm\s+)?(${YEAR})\b`),
      );
    if (m) out.deathYear = m[1];
  }

  // ── Địa chỉ ───────────────────────────────────────────────────────────────
  // Nhãn tường minh ⇒ chính xác cao. Lấy tới hết DÒNG chứ không cắt ở dấu
  // chấm: địa chỉ Việt Nam đầy "Q.1", "Tp. HCM", "P. Bình Đa". Chỉ cắt khi gặp
  // nhãn khác nối đuôi trong cùng dòng.
  const addr = note.match(/Địa chỉ:\s*([^\n]+)/);
  if (addr) {
    const cleaned = addr[1].split(/\s(?=Mộ:|Kỵ:|Tháp:)/)[0].trim().replace(/[.,;]+$/, '');
    if (cleaned) out.address = cleaned;
  }

  // ── Nghề nghiệp ───────────────────────────────────────────────────────────
  // CHỈ khi có từ khoá rõ ràng. Trên bộ dữ liệu này chỉ khoảng 10/479 người
  // có — đây là vét phần chắc chắn, không phải trường phổ quát. Phần còn lại
  // nằm trong `biography` để gia đình tự điền.
  const occ = note.match(
    /(Liệt sĩ|cán bộ[^.,\n]{0,45}|giáo viên[^.,\n]{0,35}|bác sĩ[^.,\n]{0,35}|kỹ sư[^.,\n]{0,35}|Trung úy[^.,\n]{0,45}|Đại úy[^.,\n]{0,45}|Thiếu úy[^.,\n]{0,45}|công nhân[^.,\n]{0,35}|nông dân|buôn bán|làm ruộng)/,
  );
  if (occ) {
    let text = occ[1].trim();
    // Cắt ở dấu "(" chưa đóng — "giáo viên (dạy tại Huyện Vĩnh Linh" đọc rất kỳ.
    const open = text.indexOf('(');
    if (open !== -1 && !text.includes(')')) text = text.slice(0, open).trim();
    out.occupation = text.replace(/[.,;]+$/, '');
  }

  // ── Mộ và ngày giỗ ────────────────────────────────────────────────────────
  const grave = note.match(/Mộ:\s*([^.\n]+)/);
  if (grave && !/^không rõ/i.test(grave[1].trim())) out.grave = grave[1].trim();

  const ky = note.match(/Kỵ:\s*(\d{1,2}[.\/]\d{1,2})\s*Âm lịch/);
  if (ky) out.deathAnniversary = ky[1].replace('/', '.');

  return out;
}

interface Person {
  key: string;            // khoá nội bộ (id nguồn, hoặc khoá tổng hợp cho con lồng)
  uuid: string;
  name: string;
  gender: string;
  generation: number;
  birthDate: string | null;
  deathDate: string | null;
  note: string | null;
  address: string | null;
  occupation: string | null;
  grave: string | null;
  deathAnniversary: string | null;
}

type Raw = {
  id?: string; name: string; gender: string; role?: string; note?: string;
  birthYear?: number; deathYear?: number;
  parents?: string[]; spouses?: Raw[]; children?: Raw[];
};

function build() {
  const files = readdirSync(IMPORT_DIR)
    .filter((f) => /^D\d+\.json$/.test(f))
    .sort((a, b) => num(a) - num(b));

  const persons = new Map<string, Person>();
  const parentEdges: Array<[string, string]> = [];  // [khoá cha/mẹ, khoá con]
  const spouseEdges: Array<[string, string]> = [];
  const topByKey = new Map<string, string>();       // "tên|parents" → khoá
  const pendingChildren: Array<{ gen: number; raw: Raw }> = [];

  const add = (key: string, raw: Raw, generation: number): Person => {
    const p: Person = {
      key,
      uuid: (raw.id && KNOWN_IDS[raw.id]) || randomUUID(),
      name: raw.name.trim(),
      gender: raw.gender,
      generation,
      birthDate: raw.birthYear != null ? String(raw.birthYear) : null,
      deathDate: raw.deathYear != null ? String(raw.deathYear) : null,
      note: raw.note?.trim() || null,
      address: null, occupation: null, grave: null, deathAnniversary: null,
    };

    // Trường tường minh trong JSON (birthYear/deathYear) LUÔN thắng note.
    const ex = extractFromNote(p.note);
    if (!p.birthDate && ex.birthYear) p.birthDate = ex.birthYear;
    if (!p.deathDate && ex.deathYear) p.deathDate = ex.deathYear;
    p.address = ex.address ?? null;
    p.occupation = ex.occupation ?? null;
    p.grave = ex.grave ?? null;
    p.deathAnniversary = ex.deathAnniversary ?? null;
    const override = raw.id ? KNOWN_DATES[raw.id] : undefined;
    if (override?.birthDate) p.birthDate = override.birthDate;
    if (override?.deathDate) p.deathDate = override.deathDate;
    persons.set(key, p);
    return p;
  };

  // ── Lượt 1: top-level + vợ. Con lồng để lượt 2, vì con có thể trùng với một
  //            bản ghi top-level ở đời sau mà lượt 1 chưa đọc tới.
  for (const f of files) {
    const gen = num(f) - 1;
    const records: Raw[] = JSON.parse(readFileSync(join(IMPORT_DIR, f), 'utf8'));

    for (const r of records) {
      add(r.id!, r, gen);
      topByKey.set(idKey(r.name, r.parents), r.id!);
      for (const p of r.parents ?? []) parentEdges.push([p, r.id!]);
      for (const c of r.children ?? []) pendingChildren.push({ gen: gen + 1, raw: c });

      for (const s of r.spouses ?? []) {
        add(s.id!, s, gen);                 // vợ CÙNG đời với chồng
        spouseEdges.push([r.id!, s.id!]);
        for (const c of s.children ?? []) pendingChildren.push({ gen: gen + 1, raw: c });
      }
    }
  }

  // ── Lượt 2: con lồng. Trùng top-level ⇒ cùng một người, chỉ bổ sung dữ liệu.
  //            Không trùng ⇒ người chỉ tồn tại ở đây, tạo mới.
  let merged = 0;
  for (const { gen, raw } of pendingChildren) {
    const k = idKey(raw.name, raw.parents);
    const existing = topByKey.get(k);

    if (existing) {
      merged++;
      const p = persons.get(existing)!;
      // Bản ghi top-level là bản đầy đủ hơn; con lồng chỉ điền vào chỗ trống.
      if (!p.birthDate && raw.birthYear != null) p.birthDate = String(raw.birthYear);
      if (!p.deathDate && raw.deathYear != null) p.deathDate = String(raw.deathYear);
      if (!p.note && raw.note) p.note = raw.note.trim();
      const ex = extractFromNote(raw.note ?? null);
      if (!p.birthDate && ex.birthYear) p.birthDate = ex.birthYear;
      if (!p.deathDate && ex.deathYear) p.deathDate = ex.deathYear;
      p.address ??= ex.address ?? null;
      p.occupation ??= ex.occupation ?? null;
      p.grave ??= ex.grave ?? null;
      p.deathAnniversary ??= ex.deathAnniversary ?? null;
      continue;
    }

    const key = `NESTED:${k}`;
    if (!persons.has(key)) {
      add(key, raw, gen);
      for (const p of raw.parents ?? []) parentEdges.push([p, key]);
    }
  }

  return { persons, parentEdges, spouseEdges, merged };
}

const num = (f: string) => parseInt(f.match(/\d+/)![0], 10);
const idKey = (name: string, parents?: string[]) =>
  `${name.trim()}|${[...(parents ?? [])].sort().join(',')}`;

async function main() {
  const apply = process.argv.includes('--apply');
  const { persons, parentEdges, spouseEdges, merged } = build();

  const byGen = new Map<number, number>();
  for (const p of persons.values()) byGen.set(p.generation, (byGen.get(p.generation) ?? 0) + 1);

  console.log(`Nguồn        : ${IMPORT_DIR}`);
  console.log(`Người         : ${persons.size}  (gộp ${merged} bản ghi con trùng top-level)`);
  console.log(`Cạnh cha/mẹ   : ${parentEdges.length}`);
  console.log(`Cạnh vợ/chồng : ${spouseEdges.length}`);
  console.log(`Đời           : ${[...byGen.keys()].sort((a, b) => a - b)
    .map((g) => `${g}:${byGen.get(g)}`).join('  ')}`);
  console.log(`Có năm sinh   : ${[...persons.values()].filter((p) => p.birthDate).length}`);
  console.log(`Có năm mất    : ${[...persons.values()].filter((p) => p.deathDate).length}`);
  console.log(`Giữ UUID cũ   : ${Object.keys(KNOWN_IDS).length}`);
  const v = [...persons.values()];
  const pct = (n: number) => `${n} (${Math.round((n / v.length) * 100)}%)`;
  console.log('\nBóc từ note:');
  console.log(`  địa chỉ     : ${pct(v.filter((p) => p.address).length)}`);
  console.log(`  nghề nghiệp : ${pct(v.filter((p) => p.occupation).length)}`);
  console.log(`  nơi an táng : ${pct(v.filter((p) => p.grave).length)}`);
  console.log(`  ngày giỗ ÂL : ${pct(v.filter((p) => p.deathAnniversary).length)}`);
  console.log(`  có tiểu sử  : ${pct(v.filter((p) => p.note).length)}`);

  // Mọi cạnh phải trỏ tới người có thật — sai ở đây là hỏng cả cây.
  const dangling = [...parentEdges, ...spouseEdges]
    .flat().filter((k) => !persons.has(k));
  if (dangling.length) {
    console.error(`\n✗ ${dangling.length} cạnh trỏ tới người không tồn tại:`, dangling.slice(0, 5));
    process.exit(1);
  }
  console.log('✓ Mọi cạnh đều trỏ tới người có thật');

  if (process.argv.includes('--sample')) {
    const withField = (k: 'address' | 'occupation' | 'birthDate' | 'deathDate') =>
      [...persons.values()].filter((x) => x[k] && x.note);
    for (const k of ['address', 'occupation', 'birthDate', 'deathDate'] as const) {
      console.log(`\n===== ${k.toUpperCase()} =====`);
      for (const x of withField(k).slice(0, 5)) {
        console.log(`  ${x.name}  →  [${x[k]}]`);
        console.log(`     note: ${x.note!.replace(/\n/g, ' / ').slice(0, 115)}`);
      }
    }
    return;
  }

  if (!apply) {
    console.log('\n(chạy thử — chưa ghi gì. Thêm --apply để ghi thật)');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.member.count();
    if (existing > 0) {
      console.error(`\n✗ Bảng members đang có ${existing} dòng. Dừng để không ghi đè.`);
      process.exit(1);
    }

    const tree = await prisma.tree.create({
      data: {
        owner_id: process.env.RESTORE_OWNER_ID ?? randomUUID(),
        title: 'Gia phả họ Đỗ Khắc — Nhị phái, Nhất chi',
        description: 'Tái tạo từ bộ JSON gia phả gốc sau sự cố mất dữ liệu 31/08/2026.',
        show: true,
      },
    });

    const list = [...persons.values()];
    await prisma.member.createMany({
      data: list.map((p) => ({
        id: p.uuid,
        name: p.name,
        normalized_name: removeVietnameseTones(p.name),
        gender: p.gender,
        birthDate: p.birthDate ?? '',
        deathDate: p.deathDate ?? '',
        generation: p.generation,
        tree_id: tree.id,
      })),
    });

    await prisma.profile.createMany({
      data: list.map((p) => ({
        member_id: p.uuid,
        fullName: p.name,
        biography: p.note,
        address: p.address,
        occupation: p.occupation,
        // CHỈ ghim đời của thuỷ tổ. profiles.generation là seed GHIM của
        // GenerationService; ghim hết 479 người thì job nền không còn gì để
        // suy ra và mọi sửa quan hệ về sau sẽ không cập nhật được đời.
        generation: p.generation === 0 ? 0 : null,
      })),
    });

    const uuidOf = (k: string) => persons.get(k)!.uuid;
    await prisma.memberRelationship.createMany({
      data: [
        ...parentEdges.map(([parent, child]) => ({
          parent_id: uuidOf(parent),
          child_id: uuidOf(child),
          type: RelationshipNatureType.BIOLOGICAL,
        })),
        // Một dòng cho mỗi cặp là đủ: tree.service và generation.algorithm đều
        // đọc cạnh SPOUSE theo cả hai chiều.
        ...spouseEdges.map(([husband, wife]) => ({
          parent_id: uuidOf(husband),
          child_id: uuidOf(wife),
          type: RelationshipNatureType.SPOUSE,
        })),
      ],
    });

    console.log(`\n✓ Đã ghi ${list.length} người, ${parentEdges.length + spouseEdges.length} quan hệ, tree ${tree.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

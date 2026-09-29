import { ExportEdge, ExportMember, FamilyData, splitVietnameseName } from './family-data';

/**
 * Xuất GEDCOM 5.5.1 (UTF-8, lineage-linked) — định dạng mọi phần mềm gia phả
 * đọc được (Gramps, MyHeritage, Ancestry, FamilySearch). Hai mục đích:
 *   1. dòng họ giữ một bản sao ĐỌC ĐƯỢC ngoài hệ thống này (backup của ta là
 *      dump Postgres — vô dụng với người không phải lập trình viên);
 *   2. chuyển sang / đối chiếu với nền tảng khác.
 *
 * GEDCOM không có "quan hệ" như bảng member_relationships; nó có FAM (một cặp
 * cha mẹ + các con). Dựng FAM từ cạnh:
 *   - các con có CÙNG bộ cha/mẹ (cùng loại ruột/nuôi) thuộc một FAM;
 *   - mỗi cặp vợ/chồng là một FAM, dù chưa có con.
 * KHÔNG đoán mẹ khi chỉ biết cha (dù cha chỉ có một vợ) — đoán sai là ghi sai
 * vào gia phả của người khác, tệ hơn để trống.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Chuỗi ngày tự do trong DB → DATE của GEDCOM. Không đọc được thì giữ nguyên dạng cụm "(…)". */
export function toGedcomDate(raw: string | null): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const valid = (d: number, m: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31;

  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{4})$/))) return m[1];
  if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)) && valid(+m[3], +m[2])) {
    return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
  }
  // Người Việt viết ngày trước tháng: 12/03/1945.
  if ((m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)) && valid(+m[1], +m[2])) {
    return `${+m[1]} ${MONTHS[+m[2] - 1]} ${m[3]}`;
  }
  if ((m = v.match(/^(\d{1,2})[/.-](\d{4})$/)) && +m[1] >= 1 && +m[1] <= 12) {
    return `${MONTHS[+m[1] - 1]} ${m[2]}`;
  }
  return `(${v.replace(/[()]/g, '')})`;
}

const MAX_LINE = 240;

/** Một giá trị có thể nhiều dòng / rất dài → dòng đầu + CONT (xuống dòng) + CONC (nối). */
export function gedcomText(level: number, tag: string, text: string): string[] {
  const out: string[] = [];
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((line, i) => {
      // '@' phải nhân đôi trong giá trị, không thì bị hiểu là con trỏ.
      const safe = line.replace(/@/g, '@@');
      const chunks = safe.length ? safe.match(new RegExp(`.{1,${MAX_LINE}}`, 'gu'))! : [''];
      chunks.forEach((chunk, j) => {
        if (i === 0 && j === 0) out.push(`${level} ${tag}${chunk ? ` ${chunk}` : ''}`);
        else out.push(`${level + 1} ${j === 0 ? 'CONT' : 'CONC'}${chunk ? ` ${chunk}` : ''}`);
      });
    });
  return out;
}

interface Family {
  id: string;
  parents: string[];
  children: Array<{ id: string; adopted: boolean }>;
}

export function buildFamilies(members: ExportMember[], edges: ExportEdge[]): Family[] {
  const known = new Set(members.map((m) => m.id));
  const families = new Map<string, Family>();
  const familyFor = (parents: string[], adopted: boolean) => {
    const sorted = [...new Set(parents)].sort();
    const key = `${adopted ? 'A' : 'B'}:${sorted.join('+')}`;
    let fam = families.get(key);
    if (!fam) {
      fam = { id: '', parents: sorted, children: [] };
      families.set(key, fam);
    }
    return fam;
  };

  // Cha mẹ của từng con, tách ruột / nuôi.
  const parentsOf = new Map<string, { bio: string[]; adopted: string[] }>();
  for (const e of edges) {
    if (!known.has(e.parent_id) || !known.has(e.child_id)) continue;
    if (e.type === 'SPOUSE') {
      familyFor([e.parent_id, e.child_id], false);
      continue;
    }
    const entry = parentsOf.get(e.child_id) ?? { bio: [], adopted: [] };
    (e.type === 'ADOPTED' ? entry.adopted : entry.bio).push(e.parent_id);
    parentsOf.set(e.child_id, entry);
  }
  for (const [childId, { bio, adopted }] of parentsOf) {
    if (bio.length) familyFor(bio, false).children.push({ id: childId, adopted: false });
    if (adopted.length) familyFor(adopted, true).children.push({ id: childId, adopted: true });
  }

  const list = [...families.values()];
  list.forEach((f, i) => (f.id = `F${i + 1}`));
  return list;
}

export interface GedcomMeta {
  title: string;
  generatedAt: Date;
}

export function buildGedcom(data: FamilyData, meta: GedcomMeta): string {
  const members = [...data.members].sort(
    (a, b) => (a.generation ?? 999) - (b.generation ?? 999) || a.name.localeCompare(b.name, 'vi'),
  );
  const indiId = new Map(members.map((m, i) => [m.id, `I${i + 1}`]));
  const byId = new Map(members.map((m) => [m.id, m]));
  const families = buildFamilies(members, data.edges);

  const famc = new Map<string, Array<{ fam: string; adopted: boolean }>>();
  const fams = new Map<string, string[]>();
  for (const f of families) {
    for (const p of f.parents) fams.set(p, [...(fams.get(p) ?? []), f.id]);
    for (const c of f.children) famc.set(c.id, [...(famc.get(c.id) ?? []), { fam: f.id, adopted: c.adopted }]);
  }

  const d = meta.generatedAt;
  const lines: string[] = [
    '0 HEAD',
    '1 SOUR DOFAMILYTREE',
    '2 VERS 2.0',
    ...gedcomText(2, 'NAME', meta.title),
    `1 DATE ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    '1 LANG Vietnamese',
  ];

  for (const m of members) {
    const { surname, given } = splitVietnameseName(m.name);
    lines.push(`0 @${indiId.get(m.id)}@ INDI`);
    // Giữ thứ tự tiếng Việt: /Họ/ Tên đệm Tên.
    lines.push(...gedcomText(1, 'NAME', surname ? `/${surname}/ ${given}` : given));
    if (surname) lines.push(...gedcomText(2, 'SURN', surname));
    if (given) lines.push(...gedcomText(2, 'GIVN', given));
    lines.push(`1 SEX ${m.gender === 'M' ? 'M' : m.gender === 'F' ? 'F' : 'U'}`);

    const birth = toGedcomDate(m.birthDate);
    if (birth) lines.push('1 BIRT', `2 DATE ${birth}`);

    const death = toGedcomDate(m.deathDate);
    if (death || m.lifeStatus === 'DECEASED') {
      // "1 DEAT Y" = biết là đã mất nhưng không rõ ngày.
      lines.push(death ? '1 DEAT' : '1 DEAT Y');
      if (death) lines.push(`2 DATE ${death}`);
      if (m.deathAnniversary) lines.push(...gedcomText(2, 'NOTE', `Ngày kỵ: ${m.deathAnniversary}`));
    }
    if (m.grave) lines.push('1 BURI', ...gedcomText(2, 'PLAC', m.grave));
    if (m.occupation) lines.push(...gedcomText(1, 'OCCU', m.occupation));
    const title = [m.familyPosition, m.clanRole].filter(Boolean).join(', ');
    if (title) lines.push(...gedcomText(1, 'TITL', title));
    if (m.generation != null) lines.push(...gedcomText(1, 'NOTE', `Đời thứ ${m.generation}`));
    if (m.biography) lines.push(...gedcomText(1, 'NOTE', m.biography));

    for (const c of famc.get(m.id) ?? []) {
      lines.push(`1 FAMC @${c.fam}@`);
      if (c.adopted) lines.push('2 PEDI adopted');
    }
    for (const f of fams.get(m.id) ?? []) lines.push(`1 FAMS @${f}@`);
    // id gốc để đối chiếu / nhập lại sau này.
    lines.push(`1 REFN ${m.id}`, '2 TYPE dofamilytree');
  }

  for (const f of families) {
    lines.push(`0 @${f.id}@ FAM`);
    const { husb, wife } = husbandAndWife(f.parents.map((id) => byId.get(id)!));
    if (husb) lines.push(`1 HUSB @${indiId.get(husb.id)}@`);
    if (wife) lines.push(`1 WIFE @${indiId.get(wife.id)}@`);
    for (const c of f.children) lines.push(`1 CHIL @${indiId.get(c.id)}@`);
  }

  lines.push('0 TRLR');
  return lines.join('\r\n') + '\r\n';
}

/**
 * GEDCOM 5.5.1 chỉ có HUSB / WIFE. Xếp theo giới tính; không rõ giới tính thì
 * người đầu là HUSB. Mẹ đơn thân vào WIFE, không vào HUSB.
 */
function husbandAndWife(parents: ExportMember[]): { husb?: ExportMember; wife?: ExportMember } {
  const [a, b] = parents;
  if (!b) return a.gender === 'F' ? { wife: a } : { husb: a };
  return a.gender === 'F' || b.gender === 'M' ? { husb: b, wife: a } : { husb: a, wife: b };
}

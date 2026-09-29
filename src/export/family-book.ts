import { escapeHtml as e } from '../mail/escape-html';
import { ExportMember, FamilyData } from './family-data';

/**
 * "Sách gia phả" — MỘT trang HTML tự chứa, dàn cho khổ A4, người dùng in hoặc
 * "Lưu thành PDF" từ trình duyệt.
 *
 * VÌ SAO KHÔNG SINH PDF Ở SERVER: tiếng Việt cần font có đủ dấu, pdfkit/puppeteer
 * nghĩa là nhúng font hoặc Chromium (hàng chục MB) vào function serverless.
 * Trình duyệt của người dùng đã có font chuẩn, dàn trang tốt hơn, và "Lưu thành
 * PDF" có sẵn ở mọi máy.
 *
 * Tự chứa: không tải font/ảnh/script ngoài (chỉ một nút gọi window.print) —
 * mở offline, lưu file .html gửi qua Zalo vẫn xem được.
 */

export interface BookMeta {
  title: string;
  generatedAt: Date;
  /** Khác null khi chỉ in một nhánh. */
  branchRootName: string | null;
}

interface Relations {
  parents: string[];
  spouses: string[];
  children: string[];
  /** id của cha/mẹ nuôi hoặc con nuôi, để ghi chú "(nuôi)". */
  adopted: Set<string>;
}

function relationsOf(data: FamilyData): Map<string, Relations> {
  const map = new Map<string, Relations>();
  const get = (id: string) => {
    let r = map.get(id);
    if (!r) map.set(id, (r = { parents: [], spouses: [], children: [], adopted: new Set() }));
    return r;
  };
  for (const edge of data.edges) {
    if (edge.type === 'SPOUSE') {
      get(edge.parent_id).spouses.push(edge.child_id);
      get(edge.child_id).spouses.push(edge.parent_id);
    } else {
      get(edge.child_id).parents.push(edge.parent_id);
      get(edge.parent_id).children.push(edge.child_id);
      if (edge.type === 'ADOPTED') {
        get(edge.child_id).adopted.add(edge.parent_id);
        get(edge.parent_id).adopted.add(edge.child_id);
      }
    }
  }
  return map;
}

const yearOf = (d: string | null) => d?.match(/\d{4}/)?.[0] ?? null;

function sortKey(m: ExportMember) {
  return Number(yearOf(m.birthDate) ?? 9999);
}

/** Không rõ cả hai năm thì bỏ dòng — "? – ?" chỉ là nhiễu trên giấy. */
function lifeSpan(m: ExportMember): string {
  if (!m.birthDate && !m.deathDate) return '';
  if (!m.deathDate) return m.lifeStatus === 'DECEASED' ? `${m.birthDate} – ?` : `Sinh ${m.birthDate}`;
  return `${m.birthDate ?? '?'} – ${m.deathDate}`;
}

const GENDER: Record<string, string> = { M: 'Nam', F: 'Nữ' };

export function buildFamilyBookHtml(data: FamilyData, meta: BookMeta): string {
  const byId = new Map(data.members.map((m) => [m.id, m]));
  const rel = relationsOf(data);

  const link = (id: string) => {
    const m = byId.get(id);
    if (!m) return '';
    return `<a href="#m-${e(id)}">${e(m.name)}${m.lifeStatus === 'DECEASED' ? ' †' : ''}</a>`;
  };
  const links = (ids: string[], adopted: Set<string> = new Set()) =>
    ids
      .map((id) => byId.get(id))
      .filter((m): m is ExportMember => !!m)
      .sort((a, b) => sortKey(a) - sortKey(b) || a.name.localeCompare(b.name, 'vi'))
      .map((m) => link(m.id) + (adopted.has(m.id) ? ' (nuôi)' : ''))
      .join(', ');

  // Chia theo đời; chưa rõ đời xếp cuối.
  const groups = new Map<number | null, ExportMember[]>();
  for (const m of data.members) groups.set(m.generation, [...(groups.get(m.generation) ?? []), m]);
  const order = [...groups.keys()].sort((a, b) => (a ?? 1e9) - (b ?? 1e9));
  const label = (g: number | null) => (g == null ? 'Chưa rõ đời' : `Đời thứ ${g}`);
  const anchor = (g: number | null) => (g == null ? 'doi-khac' : `doi-${g}`);

  const deceased = data.members.filter((m) => m.lifeStatus === 'DECEASED').length;
  const known = order.filter((g) => g != null) as number[];

  const card = (m: ExportMember) => {
    const r = rel.get(m.id) ?? { parents: [], spouses: [], children: [], adopted: new Set<string>() };
    const rows: Array<[string, string]> = [];
    const push = (k: string, v: string | null | undefined, raw = false) => {
      if (v) rows.push([k, raw ? v : e(v)]);
    };
    push('Giới tính', m.gender ? GENDER[m.gender] ?? null : null);
    push('Năm sinh – mất', lifeSpan(m));
    push('Cha mẹ', links(r.parents, r.adopted), true);
    push('Vợ / chồng', links(r.spouses), true);
    push('Con', links(r.children, r.adopted), true);
    push('Nghề nghiệp', m.occupation);
    push('Vai trò trong họ', [m.familyPosition, m.clanRole].filter(Boolean).join(', '));
    push('Ngày kỵ', m.deathAnniversary);
    push('Mộ phần', m.grave);

    return `<article class="member" id="m-${e(m.id)}">
  <h3>${e(m.name)}${m.lifeStatus === 'DECEASED' ? ' <span class="dagger" title="Đã mất">†</span>' : ''}</h3>
  ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${e(k)}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}
  ${m.biography ? `<div class="bio">${e(m.biography).replace(/\n/g, '<br>')}</div>` : ''}
</article>`;
  };

  const sections = order
    .map((g) => {
      const list = groups
        .get(g)!
        .sort((a, b) => sortKey(a) - sortKey(b) || a.name.localeCompare(b.name, 'vi'));
      return `<section class="generation" id="${anchor(g)}">
<h2>${label(g)} <small>(${list.length} người)</small></h2>
${list.map(card).join('\n')}
</section>`;
    })
    .join('\n');

  const toc = order
    .map((g) => `<li><a href="#${anchor(g)}">${label(g)}</a> — ${groups.get(g)!.length} người</li>`)
    .join('');

  const date = meta.generatedAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(meta.title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  :root { color-scheme: light; }
  body { font-family: "Noto Serif", "Times New Roman", Georgia, serif; color: #1f1a14; background: #fff;
         max-width: 820px; margin: 0 auto; padding: 24px 16px; line-height: 1.45; font-size: 12pt; }
  a { color: inherit; text-decoration: none; border-bottom: 1px dotted #9a8a78; }
  .cover { text-align: center; padding: 18vh 0 12vh; page-break-after: always; }
  .cover h1 { font-size: 30pt; margin: 0 0 8px; letter-spacing: .02em; }
  .cover .sub { font-size: 14pt; color: #5c4f42; }
  .cover .stats { margin-top: 32px; color: #5c4f42; }
  nav { page-break-after: always; }
  nav ol { padding-left: 20px; }
  .generation { page-break-before: always; }
  .generation h2 { border-bottom: 2px solid #8a5a2b; padding-bottom: 4px; }
  .generation h2 small { font-weight: normal; color: #6b5b4b; font-size: 11pt; }
  .member { break-inside: avoid; page-break-inside: avoid; border-left: 3px solid #e3d6c6; padding: 2px 0 2px 12px; margin: 0 0 16px; }
  .member h3 { margin: 0 0 4px; font-size: 13.5pt; }
  .dagger { color: #6b5b4b; font-weight: normal; }
  dl { display: grid; grid-template-columns: 9.5em 1fr; gap: 1px 10px; margin: 0; }
  dt { color: #6b5b4b; }
  dd { margin: 0; }
  .bio { margin-top: 6px; text-align: justify; }
  .print { position: fixed; top: 12px; right: 12px; font: 14px system-ui, sans-serif; padding: 8px 14px;
           background: #8a5a2b; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
  @media print { .print { display: none; } body { padding: 0; max-width: none; } }
</style>
</head>
<body>
<button class="print" onclick="window.print()">In / Lưu PDF</button>
<header class="cover">
  <h1>${e(meta.title)}</h1>
  ${meta.branchRootName ? `<div class="sub">Chi của ${e(meta.branchRootName)}</div>` : ''}
  <div class="stats">
    ${data.members.length} người · ${known.length ? `${known.length} đời (từ đời ${Math.min(...known)} đến đời ${Math.max(...known)})` : ''}${deceased ? ` · ${deceased} người đã khuất` : ''}
  </div>
  <div class="stats">Trích xuất ngày ${e(date)}</div>
</header>
<nav>
  <h2>Mục lục</h2>
  <ol>${toc}</ol>
  <p style="color:#6b5b4b">Dấu † : người đã khuất. Bấm vào tên để tới mục của người đó.</p>
</nav>
${sections}
</body>
</html>`;
}

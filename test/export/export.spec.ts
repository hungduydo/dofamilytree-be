import { buildFamilies, buildGedcom, gedcomText, toGedcomDate } from '../../src/export/gedcom';
import { buildFamilyBookHtml } from '../../src/export/family-book';
import { ExportMember, FamilyData, loadFamilyData, restrictToBranch, splitVietnameseName } from '../../src/export/family-data';

const person = (id: string, over: Partial<ExportMember> = {}): ExportMember => ({
  id,
  name: `Đỗ Văn ${id}`,
  gender: 'M',
  birthDate: null,
  deathDate: null,
  lifeStatus: 'UNKNOWN',
  generation: null,
  occupation: null,
  biography: null,
  familyPosition: null,
  clanRole: null,
  deathAnniversary: null,
  grave: null,
  ...over,
});

//   ong ⇄ ba
//    ├── cha ⇄ me
//    │    ├── con1
//    │    └── con2 (mẹ nuôi: me-nuoi)
//    └── chu
const DATA: FamilyData = {
  members: [
    person('ong', { generation: 1, lifeStatus: 'DECEASED', deathAnniversary: '5/3 âm lịch', grave: 'Đùng Vành' }),
    person('ba', { gender: 'F', generation: 1 }),
    person('cha', { generation: 2, birthDate: '12/03/1945' }),
    person('me', { gender: 'F', generation: 2 }),
    person('me-nuoi', { gender: 'F', generation: 2 }),
    person('chu', { generation: 2 }),
    person('con1', { generation: 3 }),
    person('con2', { generation: 3 }),
  ],
  edges: [
    { parent_id: 'ong', child_id: 'ba', type: 'SPOUSE' },
    { parent_id: 'ong', child_id: 'cha', type: 'BIOLOGICAL' },
    { parent_id: 'ba', child_id: 'cha', type: 'BIOLOGICAL' },
    { parent_id: 'ong', child_id: 'chu', type: 'BIOLOGICAL' },
    { parent_id: 'cha', child_id: 'me', type: 'SPOUSE' },
    { parent_id: 'cha', child_id: 'con1', type: 'BIOLOGICAL' },
    { parent_id: 'me', child_id: 'con1', type: 'BIOLOGICAL' },
    { parent_id: 'cha', child_id: 'con2', type: 'BIOLOGICAL' },
    { parent_id: 'me-nuoi', child_id: 'con2', type: 'ADOPTED' },
  ],
};

describe('toGedcomDate', () => {
  it.each([
    ['1945', '1945'],
    ['1945-03-12', '12 MAR 1945'],
    ['1945-03-12T00:00:00.000Z', '12 MAR 1945'],
    ['12/03/1945', '12 MAR 1945'], // ngày trước tháng, kiểu Việt
    ['3/1945', 'MAR 1945'],
    ['khoảng 1900 (?)', '(khoảng 1900 ?)'],
    ['', null],
    [null, null],
  ])('%p → %p', (raw, expected) => {
    expect(toGedcomDate(raw as any)).toBe(expected);
  });
});

describe('gedcomText', () => {
  it('xuống dòng thành CONT, "@" nhân đôi, dòng dài cắt bằng CONC', () => {
    const lines = gedcomText(1, 'NOTE', `a@b\n${'x'.repeat(300)}`);
    expect(lines[0]).toBe('1 NOTE a@@b');
    expect(lines[1]).toMatch(/^2 CONT x{240}$/);
    expect(lines[2]).toMatch(/^2 CONC x{60}$/);
  });
});

describe('buildFamilies', () => {
  it('con cùng cha mẹ chung một FAM; cha đơn + mẹ nuôi là FAM riêng; vợ chồng chưa có con vẫn là FAM', () => {
    const fams = buildFamilies(DATA.members, DATA.edges);
    const byParents = (ids: string[]) => fams.find((f) => f.parents.join() === [...ids].sort().join());
    expect(byParents(['cha', 'me'])!.children).toEqual([{ id: 'con1', adopted: false }]);
    expect(byParents(['cha'])!.children).toEqual([{ id: 'con2', adopted: false }]);
    expect(byParents(['me-nuoi'])!.children).toEqual([{ id: 'con2', adopted: true }]);
    // Không đoán mẹ cho "chu" dù ông chỉ có một vợ.
    expect(byParents(['ong'])!.children).toEqual([{ id: 'chu', adopted: false }]);
  });
});

describe('buildGedcom', () => {
  const ged = buildGedcom(DATA, { title: 'Gia phả họ Đỗ', generatedAt: new Date('2026-09-29T00:00:00Z') });
  const lines = ged.split('\r\n');

  it('header 5.5.1 UTF-8 và trailer', () => {
    expect(lines[0]).toBe('0 HEAD');
    expect(ged).toContain('2 VERS 5.5.1\r\n2 FORM LINEAGE-LINKED\r\n1 CHAR UTF-8');
    expect(lines[lines.length - 2]).toBe('0 TRLR');
  });

  it('tên giữ thứ tự Việt, đã mất không rõ ngày ghi DEAT Y kèm ngày kỵ và mộ', () => {
    expect(ged).toContain('1 NAME /Đỗ/ Văn ong\r\n2 SURN Đỗ\r\n2 GIVN Văn ong');
    expect(ged).toContain('1 DEAT Y\r\n2 NOTE Ngày kỵ: 5/3 âm lịch');
    expect(ged).toContain('1 BURI\r\n2 PLAC Đùng Vành');
    expect(ged).toContain('1 BIRT\r\n2 DATE 12 MAR 1945');
  });

  it('con nuôi có PEDI adopted; mẹ đơn thân vào WIFE', () => {
    expect(ged).toMatch(/1 FAMC @F\d+@\r\n2 PEDI adopted/);
    const idOf = (name: string) => ged.match(new RegExp(`0 @(I\\d+)@ INDI\\r\\n1 NAME /Đỗ/ Văn ${name}\\r\\n`))![1];
    expect(ged).toContain(`1 WIFE @${idOf('me-nuoi')}@`);
    expect(ged).not.toContain(`1 HUSB @${idOf('me-nuoi')}@`);
  });

  it('mọi con trỏ @X@ đều có bản ghi tương ứng', () => {
    const defined = new Set([...ged.matchAll(/^0 @(\w+)@/gm)].map((m) => m[1]));
    const used = [...ged.matchAll(/^\d [A-Z]+ @(\w+)@$/gm)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) expect(defined).toContain(id);
  });
});

describe('restrictToBranch', () => {
  it('nhánh của "cha": cha, hậu duệ và vợ — không có ông bà, chú', () => {
    const ids = restrictToBranch(DATA, 'cha').members.map((m) => m.id).sort();
    expect(ids).toEqual(['cha', 'con1', 'con2', 'me']);
  });
});

describe('buildFamilyBookHtml', () => {
  const html = buildFamilyBookHtml(DATA, {
    title: 'Gia phả họ Đỗ',
    generatedAt: new Date('2026-09-29T00:00:00Z'),
    branchRootName: null,
  });

  it('chia theo đời, có mục lục, link chéo tới cha mẹ / con', () => {
    expect(html).toContain('id="doi-1"');
    expect(html).toContain('<a href="#doi-3">Đời thứ 3</a> — 2 người');
    expect(html).toMatch(/Cha mẹ<\/dt><dd><a href="#m-ong">Đỗ Văn ong †<\/a>/);
  });

  it('đánh dấu con nuôi / cha mẹ nuôi; không in "? – ?" khi không rõ năm', () => {
    expect(html).toMatch(/Cha mẹ<\/dt><dd>.*Đỗ Văn me-nuoi<\/a> \(nuôi\)/);
    expect(html).not.toContain('? – ?');
  });

  it('escape dữ liệu người dùng nhập', () => {
    const evil = buildFamilyBookHtml(
      { members: [person('x', { name: '<script>alert(1)</script>', biography: '<img onerror=x>' })], edges: [] },
      { title: '<b>t</b>', generatedAt: new Date(), branchRootName: null },
    );
    expect(evil).not.toContain('<script>alert');
    expect(evil).not.toContain('<img onerror');
    expect(evil).not.toContain('<b>t</b>');
  });
});

describe('loadFamilyData — không bao giờ kéo cột liên lạc', () => {
  it('select profile không có phone / contactEmail / address / notes', async () => {
    const db: any = {
      member: { findMany: jest.fn().mockResolvedValue([]) },
      memberRelationship: { findMany: jest.fn().mockResolvedValue([]) },
      anniversary: { findMany: jest.fn().mockResolvedValue([]) },
      cemetery: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await loadFamilyData(db);
    const profileSelect = db.member.findMany.mock.calls[0][0].select.profile.select;
    for (const col of ['phone', 'contactEmail', 'address', 'notes']) expect(profileSelect).not.toHaveProperty(col);
  });
});

describe('splitVietnameseName', () => {
  it('họ đứng đầu', () => {
    expect(splitVietnameseName('Đỗ  Văn   Hùng')).toEqual({ surname: 'Đỗ', given: 'Văn Hùng' });
    expect(splitVietnameseName('Hùng')).toEqual({ surname: '', given: 'Hùng' });
  });
});

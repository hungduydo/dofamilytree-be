import { computeClanMembers, ClanEdgeInput } from '../../src/members/clan-lineage';

const child = (parent: string, kid: string, type = 'BIOLOGICAL'): ClanEdgeInput => ({ parent_id: parent, child_id: kid, type });
const spouse = (a: string, b: string): ClanEdgeInput => ({ parent_id: a, child_id: b, type: 'SPOUSE' });

/*
 *  founder ── wife
 *     ├── son ── dil
 *     │    └── grandson
 *     └── daughter ── sil (con rể)
 *          └── outGrandkid (ngoại)
 */
const members = [
  { id: 'founder', gender: 'M' },
  { id: 'wife', gender: 'F' },
  { id: 'son', gender: 'M' },
  { id: 'dil', gender: 'F' },
  { id: 'grandson', gender: 'M' },
  { id: 'daughter', gender: 'F' },
  { id: 'sil', gender: 'M' },
  { id: 'outGrandkid', gender: 'F' },
];
const edges = [
  spouse('founder', 'wife'),
  child('founder', 'son'), child('wife', 'son'),
  child('founder', 'daughter'), child('wife', 'daughter'),
  spouse('dil', 'son'),
  child('son', 'grandson'), child('dil', 'grandson'),
  spouse('daughter', 'sil'),
  child('sil', 'outGrandkid'), child('daughter', 'outGrandkid'),
];

describe('computeClanMembers (nội tộc, theo dòng cha)', () => {
  const clan = computeClanMembers(members, edges);

  it('cụ tổ và hậu duệ qua người cha là người trong họ — cả con gái', () => {
    expect([...clan].sort()).toEqual(['daughter', 'founder', 'grandson', 'son']);
  });

  it('con dâu, con rể và con của con gái là người ngoài', () => {
    for (const id of ['wife', 'dil', 'sil', 'outGrandkid']) expect(clan.has(id)).toBe(false);
  });

  it('con nuôi của người trong họ là người trong họ', () => {
    const result = computeClanMembers(
      [...members, { id: 'adoptee', gender: 'M' }],
      [...edges, child('son', 'adoptee', 'ADOPTED')],
    );
    expect(result.has('adoptee')).toBe(true);
  });

  it('chỉ ghi mẹ (trong họ) mà không ghi cha ⇒ vẫn là ngoại tộc', () => {
    const result = computeClanMembers(
      [...members, { id: 'onlyMother', gender: 'M' }],
      [...edges, child('daughter', 'onlyMother')],
    );
    expect(result.has('onlyMother')).toBe(false);
  });

  it('cha chưa rõ giới tính vẫn truyền dòng họ', () => {
    const result = computeClanMembers(
      [{ id: 'root', gender: null }, { id: 'kid', gender: 'U' }],
      [child('root', 'kid')],
    );
    expect([...result].sort()).toEqual(['kid', 'root']);
  });

  it('cycle trong dữ liệu không làm treo hay tràn stack', () => {
    const result = computeClanMembers(
      [{ id: 'a', gender: 'M' }, { id: 'b', gender: 'M' }],
      [child('a', 'b'), child('b', 'a')],
    );
    expect(result.size).toBe(0);
  });

  it('bỏ qua cạnh trỏ tới thành viên không tồn tại', () => {
    const result = computeClanMembers([{ id: 'x', gender: 'M' }], [child('ghost', 'x')]);
    expect(result.has('x')).toBe(true);
  });
});

/**
 * "Trong họ" theo DÒNG CHA (nội tộc) — hàm thuần, không Prisma, để test bằng
 * fixture đồ thị như generation.algorithm.ts.
 *
 * Không có cột nào đánh dấu người trong họ, nên suy ra từ member_relationships:
 *
 *   - CỤ TỔ: không phải nữ, không có cha/mẹ trong cây, và không có vợ/chồng nào
 *     có cha/mẹ trong cây. Vế cuối là thứ loại con rể: anh ấy cũng "mồ côi" trong
 *     cây, nhưng vợ anh ấy có cha mẹ ⇒ anh ấy cưới VÀO họ chứ không khai sinh ra họ.
 *   - TRONG HỌ: cụ tổ, và bất kỳ ai có một người cha thuộc họ (con trai lẫn con gái).
 *     Dòng họ chỉ truyền qua cha mẹ KHÔNG phải nữ — cha mẹ chưa rõ giới tính vẫn
 *     truyền, vì không có căn cứ để loại.
 *   - NGƯỜI NGOÀI: phần còn lại — con dâu, con rể, con của con gái (ngoại tộc).
 *
 * ADOPTED được coi như BIOLOGICAL: con nuôi của người trong họ là người trong họ.
 */

export interface ClanMemberInput {
  id: string;
  gender: string | null;
}

export interface ClanEdgeInput {
  parent_id: string;
  child_id: string;
  type: string;
}

export function computeClanMembers(members: ClanMemberInput[], edges: ClanEdgeInput[]): Set<string> {
  const gender = new Map(members.map((m) => [m.id, m.gender]));
  const parents = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };

  for (const e of edges) {
    if (!gender.has(e.parent_id) || !gender.has(e.child_id) || e.parent_id === e.child_id) continue;
    if (e.type === 'SPOUSE') {
      push(spouses, e.parent_id, e.child_id);
      push(spouses, e.child_id, e.parent_id);
    } else {
      push(parents, e.child_id, e.parent_id);
    }
  }

  const hasParents = (id: string) => (parents.get(id)?.length ?? 0) > 0;
  const isFounder = (id: string) =>
    gender.get(id) !== 'F' && !hasParents(id) && !(spouses.get(id) ?? []).some(hasParents);

  // Memo + đánh dấu "đang xét": bảng member_relationships không chặn cycle, nên
  // một vòng A→B→A phải dừng (và trả false) thay vì tràn stack.
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();
  const inClan = (id: string): boolean => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return false;
    visiting.add(id);
    const result = hasParents(id)
      ? (parents.get(id) ?? []).some((p) => gender.get(p) !== 'F' && inClan(p))
      : isFounder(id);
    visiting.delete(id);
    memo.set(id, result);
    return result;
  };

  return new Set(members.map((m) => m.id).filter(inClan));
}

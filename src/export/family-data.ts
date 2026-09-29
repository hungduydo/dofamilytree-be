import { Prisma } from '@prisma/client';
import { committeeRoleLabel } from '../members/committee-role';

/**
 * Dữ liệu chung cho các định dạng xuất (GEDCOM, sách in). Tải MỘT lần, không
 * N+1: cây ~500 người, vài trăm cạnh — gọn trong vài query phẳng.
 *
 * KHÔNG BAO GIỜ có 4 cột liên lạc (phone / contactEmail / address / notes):
 * file xuất rời khỏi hệ thống, được chuyển tiếp, in ra, tải lên site khác —
 * mọi kiểm soát PII của API mất tác dụng từ lúc đó.
 */

export interface ExportMember {
  id: string;
  name: string;
  gender: string | null;
  birthDate: string | null;
  deathDate: string | null;
  lifeStatus: string;
  generation: number | null;
  occupation: string | null;
  biography: string | null;
  familyPosition: string | null;
  clanRole: string | null;
  /** "5/3 âm lịch" — ngày kỵ DEATH gắn với người này. */
  deathAnniversary: string | null;
  /** Tên mộ (và khu nếu có). */
  grave: string | null;
}

export interface ExportEdge {
  parent_id: string;
  child_id: string;
  type: 'BIOLOGICAL' | 'ADOPTED' | 'SPOUSE' | string;
}

export interface FamilyData {
  members: ExportMember[];
  edges: ExportEdge[];
}

type Db = Pick<Prisma.TransactionClient, 'member' | 'memberRelationship' | 'anniversary' | 'cemetery'>;

export async function loadFamilyData(db: Db): Promise<FamilyData> {
  const [members, edges, anniversaries, graves] = await Promise.all([
    db.member.findMany({
      select: {
        id: true, name: true, gender: true, birthDate: true, deathDate: true, lifeStatus: true, generation: true,
        // Liệt kê TƯỜNG MINH thay vì PROFILE_PUBLIC_SELECT: thêm cột mới vào
        // profile không được tự động lọt vào file xuất.
        profile: { select: { occupation: true, biography: true, familyPosition: true, committeeRole: true } },
      },
    }),
    db.memberRelationship.findMany({ select: { parent_id: true, child_id: true, type: true } }),
    db.anniversary.findMany({
      where: { kind: 'DEATH', member_id: { not: null } },
      select: { member_id: true, calendar: true, day: true, month: true, isLeapMonth: true },
    }),
    db.cemetery.findMany({
      where: { member_id: { not: null } },
      select: { member_id: true, name: true, area: { select: { name: true } } },
    }),
  ]);

  const annByMember = new Map<string, string>();
  for (const a of anniversaries) {
    const cal = a.calendar === 'LUNAR' ? ` âm lịch${a.isLeapMonth ? ' (tháng nhuận)' : ''}` : ' dương lịch';
    annByMember.set(a.member_id!, `${a.day}/${a.month}${cal}`);
  }
  const graveByMember = new Map<string, string>();
  for (const g of graves) {
    graveByMember.set(g.member_id!, g.area?.name && g.area.name !== g.name ? `${g.name} (${g.area.name})` : g.name);
  }

  return {
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      gender: m.gender,
      birthDate: blankToNull(m.birthDate),
      deathDate: blankToNull(m.deathDate),
      lifeStatus: m.lifeStatus,
      generation: m.generation,
      occupation: blankToNull(m.profile?.occupation),
      biography: blankToNull(m.profile?.biography),
      familyPosition: blankToNull(m.profile?.familyPosition),
      clanRole: m.profile?.committeeRole ? committeeRoleLabel(m.profile.committeeRole) : null,
      deathAnniversary: annByMember.get(m.id) ?? null,
      grave: graveByMember.get(m.id) ?? null,
    })),
    edges,
  };
}

function blankToNull(v: string | null | undefined): string | null {
  return v?.trim() ? v.trim() : null;
}

/**
 * Chỉ giữ một nhánh: `rootId`, mọi hậu duệ (ruột + nuôi) và vợ/chồng của họ —
 * con dâu, con rể là một phần của nhánh khi in. Có chặn vòng.
 */
export function restrictToBranch(data: FamilyData, rootId: string): FamilyData {
  const childrenOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  for (const e of data.edges) {
    if (e.type === 'SPOUSE') {
      push(spousesOf, e.parent_id, e.child_id);
      push(spousesOf, e.child_id, e.parent_id);
    } else {
      push(childrenOf, e.parent_id, e.child_id);
    }
  }

  const line = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    if (line.has(id)) continue;
    line.add(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  const keep = new Set(line);
  for (const id of line) for (const s of spousesOf.get(id) ?? []) keep.add(s);

  return {
    members: data.members.filter((m) => keep.has(m.id)),
    edges: data.edges.filter((e) => keep.has(e.parent_id) && keep.has(e.child_id)),
  };
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

/** Tách "Đỗ Văn A" → họ "Đỗ", tên "Văn A". Tên tiếng Việt: họ đứng đầu. */
export function splitVietnameseName(full: string): { surname: string; given: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { surname: '', given: parts[0] ?? '' };
  return { surname: parts[0], given: parts.slice(1).join(' ') };
}

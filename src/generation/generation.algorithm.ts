/**
 * Tính thế hệ ("thế hệ") của từng thành viên từ đồ thị quan hệ.
 *
 * Hàm thuần — không import Nest, không import Prisma. Đây là thứ cho phép test
 * bằng fixture đồ thị thay vì mock `$queryRaw`, và đây là phần quan trọng nhất
 * về tính đúng của cả tính năng.
 *
 * Ý tưởng cốt lõi: gom cụm vợ/chồng bằng Union-Find biến bài toán điểm bất động
 * thành shortest-path thường. Cạnh SPOUSE là hai chiều, nên nếu lan truyền trực
 * tiếp thì "vợ/chồng của một hậu duệ" chỉ được phát hiện sau khi hậu duệ đó đã
 * có thế hệ — tức kết quả phụ thuộc thứ tự duyệt. Khi mỗi cụm vợ chồng co lại
 * thành một siêu-đỉnh thì vấn đề biến mất hoàn toàn: không bao giờ cần lan
 * truyền *tới* một người vợ/chồng, họ *là* cùng một đỉnh.
 */

export interface GenerationEdge {
  parent_id: string;
  child_id: string;
}

export interface GenerationInput {
  memberIds: string[];
  /** Cạnh cha-con: chỉ BIOLOGICAL | ADOPTED. */
  parentEdges: GenerationEdge[];
  /**
   * Cạnh SPOUSE. Direction-agnostic — trong `member_relationships` một người
   * vợ/chồng có thể nằm ở `parent_id` hoặc `child_id`, truyền nguyên trạng.
   */
  spouseEdges: GenerationEdge[];
  /** `profiles.generation` khác null. Là seed được GHIM, không chỉ để hiển thị. */
  pins: Map<string, number>;
}

export interface GenerationResult {
  /** Mọi memberId trong input đều có giá trị (≥ 1). */
  generations: Map<string, number>;
  /** Bất thường trong dữ liệu (cycle, pin mâu thuẫn, cạnh tự trỏ). Không throw. */
  warnings: string[];
}

/**
 * Lớn hơn hẳn độ sâu dòng họ khả dĩ. Đảm bảo dừng kể cả khi dữ liệu có cycle
 * (bảng `member_relationships` không có ràng buộc nào chặn A→B→A).
 */
const MAX_ROUNDS = 64;

export function computeGenerations(input: GenerationInput): GenerationResult {
  const { memberIds, parentEdges, spouseEdges, pins } = input;
  const warnings: string[] = [];

  // ── 1. Union-Find trên cạnh SPOUSE → cụm vợ chồng ────────────────────────
  const parentOf = new Map<string, string>(memberIds.map((id) => [id, id]));

  const find = (x: string): string => {
    let root = x;
    while (parentOf.get(root) !== root) root = parentOf.get(root) as string;
    // Path compression.
    let cur = x;
    while (parentOf.get(cur) !== root) {
      const next = parentOf.get(cur) as string;
      parentOf.set(cur, root);
      cur = next;
    }
    return root;
  };

  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // Merge tất định: id nhỏ hơn theo thứ tự từ điển làm root. Không dùng
    // union-by-rank vì rank phụ thuộc thứ tự cạnh, mà kết quả phải là hàm của
    // đồ thị chứ không của thứ tự dòng Postgres trả về.
    if (ra < rb) parentOf.set(rb, ra);
    else parentOf.set(ra, rb);
  };

  for (const e of spouseEdges) {
    if (parentOf.has(e.parent_id) && parentOf.has(e.child_id)) {
      union(e.parent_id, e.child_id);
    }
  }

  // ── 2. Dựng DAG cụm→cụm từ cạnh cha-con ──────────────────────────────────
  const outEdges = new Map<string, Set<string>>();
  const hasIncoming = new Set<string>();

  for (const e of parentEdges) {
    if (!parentOf.has(e.parent_id) || !parentOf.has(e.child_id)) continue;
    const p = find(e.parent_id);
    const c = find(e.child_id);
    if (p === c) {
      // Cha/con nằm cùng cụm vợ chồng, hoặc cạnh tự trỏ. Dữ liệu sai; bỏ qua
      // để không tạo cạnh vào giả khiến cả cụm mất tư cách gốc.
      warnings.push(`parent edge ${e.parent_id} -> ${e.child_id} collapses into a single cluster; skipped`);
      continue;
    }
    let tos = outEdges.get(p);
    if (!tos) outEdges.set(p, (tos = new Set()));
    tos.add(c);
    hasIncoming.add(c);
  }

  // ── 3. Seed ──────────────────────────────────────────────────────────────
  const clusters = new Set(memberIds.map(find));

  // Pin ở mức cụm: dùng để lan truyền xuống con. Pin của từng cá nhân được áp
  // lại ở bước 6, nên hai vợ chồng ghim lệch nhau vẫn giữ đúng số của mình.
  const pinnedCluster = new Map<string, number>();
  for (const [memberId, g] of pins) {
    if (!parentOf.has(memberId)) continue;
    const c = find(memberId);
    const prev = pinnedCluster.get(c);
    if (prev !== undefined && prev !== g) {
      warnings.push(
        `conflicting manual generations in spouse cluster ${c}: ${prev} vs ${g}; propagating ${Math.min(prev, g)}`,
      );
    }
    pinnedCluster.set(c, prev === undefined ? g : Math.min(prev, g));
  }

  const gen = new Map<string, number>(pinnedCluster);
  for (const c of clusters) {
    // "Không có cha/mẹ BIOLOGICAL|ADOPTED VÀ không có vợ/chồng nào có cha mẹ"
    // chính là "cụm không có cạnh vào" — miễn phí nhờ bước gom cụm.
    if (!hasIncoming.has(c) && !gen.has(c)) gen.set(c, 1);
  }

  // ── 4. Relax min-wins (BFS trọng số 1 từ tập seed) ───────────────────────
  const relax = () => {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      let changed = false;
      for (const [from, tos] of outEdges) {
        const g = gen.get(from);
        if (g === undefined) continue;
        for (const to of tos) {
          if (pinnedCluster.has(to)) continue; // pin của người dùng không bao giờ bị ghi đè
          const cur = gen.get(to);
          if (cur === undefined || g + 1 < cur) {
            gen.set(to, g + 1);
            changed = true;
          }
        }
      }
      if (!changed) return;
    }
    warnings.push(`generation relaxation did not converge in ${MAX_ROUNDS} rounds (cyclic data?)`);
  };
  relax();

  // ── 5. Component toàn cycle không có gốc → không có seed nào chạm tới ────
  // Seed cụm chưa giải nhỏ nhất theo thứ tự từ điển ở 1 rồi relax lại. Dữ liệu
  // lành mạnh thì vòng này không chạy lần nào.
  let guard = clusters.size + 1;
  while (guard-- > 0) {
    let smallestUnresolved: string | undefined;
    for (const c of clusters) {
      if (gen.has(c)) continue;
      if (smallestUnresolved === undefined || c < smallestUnresolved) smallestUnresolved = c;
    }
    if (smallestUnresolved === undefined) break;
    warnings.push(`unrooted (cyclic) component seeded at generation 1: ${smallestUnresolved}`);
    gen.set(smallestUnresolved, 1);
    relax();
  }

  // ── 6. Trải cụm về từng thành viên ───────────────────────────────────────
  // Pin của chính thành viên luôn thắng giá trị cụm; giá trị cụm chỉ dùng để
  // lan truyền xuống con.
  const generations = new Map<string, number>();
  for (const id of memberIds) {
    generations.set(id, pins.get(id) ?? gen.get(find(id)) ?? 1);
  }

  return { generations, warnings };
}

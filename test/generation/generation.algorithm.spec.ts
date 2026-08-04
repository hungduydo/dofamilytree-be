import {
  computeGenerations,
  GenerationEdge,
  GenerationInput,
  GenerationResult,
} from '../../src/generation/generation.algorithm';

/** Cạnh cha-con. */
const p = (parent_id: string, child_id: string): GenerationEdge => ({ parent_id, child_id });
/** Cạnh vợ/chồng — direction-agnostic, hai tham số chỉ là hai cột trong DB. */
const s = (a: string, b: string): GenerationEdge => ({ parent_id: a, child_id: b });

function run(
  memberIds: string[],
  opts: Partial<Omit<GenerationInput, 'memberIds'>> = {},
): GenerationResult {
  const result = computeGenerations({
    memberIds,
    parentEdges: opts.parentEdges ?? [],
    spouseEdges: opts.spouseEdges ?? [],
    pins: opts.pins ?? new Map(),
  });
  // Invariant chạy trong MỌI case: không ai bị bỏ sót, không NaN/Infinity, không < 1.
  expect(result.generations.size).toBe(memberIds.length);
  for (const id of memberIds) {
    const g = result.generations.get(id);
    expect(Number.isInteger(g)).toBe(true);
    expect(g).toBeGreaterThanOrEqual(1);
  }
  return result;
}

/** Thu gọn Map thành object cho assert dễ đọc. */
const flat = (r: GenerationResult) => Object.fromEntries(r.generations);

describe('computeGenerations', () => {
  it('1. gán 1,2,3 cho chuỗi cha-con tuyến tính', () => {
    const r = run(['A', 'B', 'C'], { parentEdges: [p('A', 'B'), p('B', 'C')] });
    expect(flat(r)).toEqual({ A: 1, B: 2, C: 3 });
    expect(r.warnings).toEqual([]);
  });

  it('2. vợ/chồng cưới vào lấy thế hệ của người bạn đời', () => {
    const r = run(['A', 'S', 'C'], {
      parentEdges: [p('A', 'C')],
      spouseEdges: [s('A', 'S')],
    });
    expect(flat(r)).toEqual({ A: 1, S: 1, C: 2 });
  });

  it('3. cạnh SPOUSE là direction-agnostic', () => {
    const forward = run(['A', 'S', 'C'], {
      parentEdges: [p('A', 'C')],
      spouseEdges: [s('A', 'S')],
    });
    const reversed = run(['A', 'S', 'C'], {
      parentEdges: [p('A', 'C')],
      spouseEdges: [s('S', 'A')], // S nằm ở cột parent_id
    });
    expect(flat(reversed)).toEqual(flat(forward));
  });

  it('4. kết quả độc lập với thứ tự cạnh trả về từ Postgres', () => {
    const members = ['A', 'S', 'C', 'D'];
    const parentEdges = [p('A', 'C'), p('C', 'D')];
    const spouseEdges = [s('A', 'S')];

    const asIs = run(members, { parentEdges, spouseEdges });
    const shuffled = run([...members].reverse(), {
      parentEdges: [...parentEdges].reverse(),
      spouseEdges,
    });
    expect(flat(shuffled)).toEqual(flat(asIs));
  });

  it('5. vợ/chồng của một HẬU DUỆ (phát hiện muộn) vẫn đúng thế hệ', () => {
    const r = run(['A', 'B', 'S2', 'C'], {
      parentEdges: [p('A', 'B'), p('B', 'C')],
      spouseEdges: [s('B', 'S2')],
    });
    expect(flat(r)).toEqual({ A: 1, B: 2, S2: 2, C: 3 });
  });

  it('6. chuỗi tái hôn A–B, B–C gộp thành một cụm cùng thế hệ', () => {
    const r = run(['A', 'B', 'C'], { spouseEdges: [s('A', 'B'), s('B', 'C')] });
    expect(flat(r)).toEqual({ A: 1, B: 1, C: 1 });
  });

  it('7. cha mẹ mâu thuẫn (2 và 4, không có cạnh spouse) → con = min + 1', () => {
    const r = run(['F', 'M', 'C'], {
      parentEdges: [p('F', 'C'), p('M', 'C')],
      pins: new Map([
        ['F', 2],
        ['M', 4],
      ]),
    });
    expect(flat(r)).toEqual({ F: 2, M: 4, C: 3 });
  });

  it('8. cycle tách rời mọi gốc vẫn dừng và cảnh báo, không throw', () => {
    const r = run(['A', 'B'], { parentEdges: [p('A', 'B'), p('B', 'A')] });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.includes('unrooted'))).toBe(true);
    // Invariant trong `run` đã bảo đảm cả hai có giá trị nguyên ≥ 1.
    expect(flat(r)).toEqual({ A: 1, B: 2 });
  });

  it('9. cạnh tự trỏ bị bỏ qua kèm cảnh báo', () => {
    const r = run(['A'], { parentEdges: [p('A', 'A')] });
    expect(flat(r)).toEqual({ A: 1 });
    expect(r.warnings.some((w) => w.includes('single cluster'))).toBe(true);
  });

  it('10. thành viên cô lập (không cạnh nào) là thế hệ 1', () => {
    const r = run(['LONE']);
    expect(flat(r)).toEqual({ LONE: 1 });
    expect(r.warnings).toEqual([]);
  });

  it('11. hai họ tách rời, mỗi gốc là thế hệ 1', () => {
    const r = run(['A', 'B', 'X', 'Y'], { parentEdges: [p('A', 'B'), p('X', 'Y')] });
    expect(flat(r)).toEqual({ A: 1, B: 2, X: 1, Y: 2 });
    expect(r.warnings).toEqual([]);
  });

  it('12. giá trị nhập tay lan truyền xuống con', () => {
    const r = run(['A', 'B'], {
      parentEdges: [p('A', 'B')],
      pins: new Map([['A', 5]]),
    });
    expect(flat(r)).toEqual({ A: 5, B: 6 });
  });

  it('13. pin trên người vợ/chồng nâng cả cụm và hậu duệ', () => {
    const r = run(['A', 'S', 'C'], {
      parentEdges: [p('A', 'C')],
      spouseEdges: [s('A', 'S')],
      pins: new Map([['S', 7]]),
    });
    expect(flat(r)).toEqual({ A: 7, S: 7, C: 8 });
  });

  it('14. hai vợ chồng ghim lệch nhau: mỗi người giữ pin của mình, con theo min', () => {
    const r = run(['A', 'B', 'C'], {
      parentEdges: [p('A', 'C')],
      spouseEdges: [s('A', 'B')],
      pins: new Map([
        ['A', 5],
        ['B', 6],
      ]),
    });
    expect(flat(r)).toEqual({ A: 5, B: 6, C: 6 });
    expect(r.warnings.some((w) => w.includes('conflicting manual generations'))).toBe(true);
  });

  it('15. chuỗi sâu 30 hội tụ đủ, MAX_ROUNDS không cắt cụt', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `m${String(i).padStart(2, '0')}`);
    // Đảo thứ tự cạnh để ép trường hợp xấu nhất: mỗi vòng relax chỉ tiến 1 bậc.
    const parentEdges = ids.slice(0, -1).map((id, i) => p(id, ids[i + 1])).reverse();

    const r = run(ids, { parentEdges });
    expect(r.generations.get(ids[0])).toBe(1);
    expect(r.generations.get(ids[29])).toBe(30);
    expect(r.warnings).toEqual([]);
  });

  it('bỏ qua cạnh trỏ tới member không tồn tại (quan hệ mồ côi)', () => {
    const r = run(['A'], {
      parentEdges: [p('A', 'GHOST')],
      spouseEdges: [s('A', 'GHOST')],
    });
    expect(flat(r)).toEqual({ A: 1 });
  });

  it('trả về map rỗng khi không có thành viên nào', () => {
    const r = run([]);
    expect(r.generations.size).toBe(0);
  });
});

/**
 * `Promise.all(items.map(fn))` nhưng tối đa `limit` lời gọi chạy cùng lúc — để
 * không bắn 200 request song song vào Google/QStash trong một function. Giữ
 * nguyên thứ tự kết quả theo `items`. Lỗi của một phần tử làm reject cả mảng,
 * giống `Promise.all` — muốn bỏ qua lỗi thì `fn` tự catch.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker);
  await Promise.all(workers);
  return results;
}

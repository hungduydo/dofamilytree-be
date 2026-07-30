# Performance: đưa mọi API v2 < 500ms — Kết quả

Ngày 2026-07-30. Mục tiêu: mọi endpoint < 500ms (trước đó >3s trên production).

## Kết quả đo (local, Redis chết, cross-Pacific tới Supabase Singapore — production co-located sẽ nhanh hơn nhiều)

| Endpoint | Trước | Sau (warm, local) |
|----------|-------|-------------------|
| `GET /tree/chart` (full) | 9150ms | **369ms** |
| `GET /tree/stats` | 9210ms | **115ms** |
| `GET /report/cached` (dashboard) | 8770ms | **117ms** |
| `GET /tree/chart/:id` (subtree) | ~1000–1760ms | **216ms** |
| members list / search / detail / rels | 110–180ms | 47–101ms |
| events / anniversaries / graves | 138–420ms | 56–191ms |
| POST relationship (mutation) | — | 611ms* |

*611ms là 4 DB round-trip tuần tự × ~110ms (network cross-Pacific từ máy dev). Co-located production → ~20–50ms. Không phải N+1.

**Tất cả GET < 400ms ngay cả ở local.** Worst = tree/chart 369ms.

## Đã sửa (code)

1. **Redis non-blocking** — `src/redis.provider.ts`: thêm `retry: false` + `signal: () => AbortSignal.timeout(300)`. Redis chết fail trong ~10ms thay vì retry 4.3s. `TreeService.safeCache*` fallback DB. → xoá phần lớn 9s ở tree/stats/report.
2. **Subtree N+1 → 1 recursive CTE** — `src/tree/tree.service.ts` `getFamilySubTreeChart`: thay BFS (O(nodes×3-4 query)) bằng 1 CTE đệ quy (mẫu `getAncestors`) + 1 findMany batched. Verify: id-set **giống hệt** old cho 14 member (0 mismatch), CTE server-side ~1ms.
3. **Vercel region pinning + serverless** — `vercel.json`: `"regions": ["sin1"]` (khớp Supabase ap-southeast-1) + `"maxDuration": 10`. `src/prisma/prisma.service.ts`: `onModuleInit` → `$connect()` cắt cold-connect.
4. **QStash ra khỏi request path** — 5 site (`auth`, `members` update, `media`, `events`, `relationships`) dùng helper mới `src/utils/run-in-background.ts` (`waitUntil` từ `@vercel/functions@3.7.6` — giữ function sống trên Vercel để job không bị drop, no-op an toàn khi chạy local). Mutation trả response ngay, không chờ QStash round-trip.

Verify: `pnpm run build` pass, `pnpm test` **103/103 pass**, smoke-test mutation 201/204 OK.

## CẦN BẠN LÀM (infra/env — không phải code)

1. **DATABASE_URL trên Vercel env**: đổi sang transaction pooler cho serverless:
   port `6543` + `?pgbouncer=true&connection_limit=1` (hiện đang dùng `5432`, không param). Supabase project này đã có sẵn pooler 6543.
2. **Region**: đảm bảo Vercel plan cho phép `regions: ["sin1"]` (Pro OK). Nếu Hobby giới hạn → set region mặc định của project = Singapore trong dashboard. Đây là đòn bẩy production lớn nhất (mỗi query cross-region ~200ms → ~5ms).
3. **Redis (tuỳ chọn, để bật lại cache)**: provision Upstash mới đặt ở **ap-southeast-1**, cập nhật `UPSTASH_REDIS_REST_URL`/`TOKEN`. Khi bật lại cache, **cần thêm invalidation** (xem dưới).

## Follow-up còn lại (chưa làm — thứ yếu / phòng data lớn)

- **Cache invalidation** `tree:chart:full` khi create/update/delete member & relationship (hiện chỉ xoá qua `/tree/regenerate`). MOOT khi Redis chết, nhưng **bắt buộc trước khi bật Redis lại** để tránh cache stale 1h. Cần inject TreeService (hoặc emit event) vào members/relationships service.
- `searchMembers` — `contains` không index (fine ở 482 dòng; index `pg_trgm` nếu bảng lớn).
- `getNearbyGraves` — full-scan + Haversine JS → bounding-box SQL nếu bảng lớn.
- `computeStats`/`handleReportGenerate` — đếm năm sinh bằng JS loop → SQL aggregate (đã cached/chạy nền, ưu tiên thấp).

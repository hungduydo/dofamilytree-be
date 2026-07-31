# API Docs & FE Integration

Backend expose OpenAPI (Swagger). FE (repo tách rời) dùng spec này để có type-safe, không phải sync tay.

## Nguồn spec

| Nguồn | URL / path | Khi nào dùng |
|-------|-----------|--------------|
| Swagger UI | `http://localhost:3002/docs` | Tra cứu bằng mắt, thử API |
| OpenAPI JSON (live) | `http://localhost:3002/docs-json` | FE generate type |
| OpenAPI JSON (snapshot) | `docs/swagger.json` | Review diff API trong PR |

Cấu hình spec là 1 nguồn duy nhất: [`src/swagger.config.ts`](../src/swagger.config.ts) — dùng chung cho `/docs` (runtime) và `pnpm swagger:export` (snapshot). Chạy lại snapshot:

```bash
pnpm swagger:export
```

> Lưu ý: **không** bật `@nestjs/swagger` CLI plugin trong `nest-cli.json`. Script export chạy qua `ts-node` (không áp dụng plugin), nên mọi schema phải khai báo bằng `@ApiProperty` tường minh trong các `*.dto.ts` — nhờ vậy `/docs` và file export luôn khớp nhau.

## FE consume (làm ở repo frontend)

### 1. Cài generator

```bash
pnpm add -D openapi-typescript
pnpm add openapi-fetch
```

### 2. Script sinh type từ URL BE

`package.json` (FE):

```json
{
  "scripts": {
    "gen:api": "openapi-typescript $API_URL/docs-json -o src/types/api.d.ts",
    "prebuild": "pnpm gen:api"
  }
}
```

- Local: `API_URL=http://localhost:3002`
- Prod build: trỏ vào domain backend đã deploy (`.../docs-json`).

Chạy trong `prebuild`/CI → type luôn tươi theo BE mới nhất, không cần commit type thủ công.

### 3. Typed client

```ts
import createClient from 'openapi-fetch';
import type { paths } from './types/api';

export const api = createClient<paths>({ baseUrl: import.meta.env.VITE_API_URL });

// Type-safe: params, body, và response đều được suy ra từ spec
const { data, error } = await api.GET('/v2/members', {
  params: { query: { page: 1, pageSize: 20 } },
});
// data: PaginatedMembersResponseDto | undefined
```

Gắn Bearer JWT qua option `headers` hoặc middleware của `openapi-fetch`.

## Khi API đổi

1. BE: cập nhật DTO / `@ApiOkResponse`, chạy `pnpm swagger:export` (hoặc chỉ cần restart để `/docs-json` cập nhật).
2. FE: `pnpm gen:api` → type mới; TypeScript sẽ báo lỗi ở chỗ nào FE dùng sai shape.

import { DocumentBuilder } from '@nestjs/swagger';

/**
 * Single source of truth for the Swagger/OpenAPI document config.
 *
 * Shared by:
 *   - src/main.ts            → live `/docs` UI + `/docs-json` the FE fetches
 *   - scripts/export-swagger.ts → docs/swagger.{json,yaml} snapshot
 *
 * Keeping one builder here means the served spec and the exported file can
 * never drift apart.
 */
export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Family Tree API v2')
    .setDescription(
      `## Vietnamese Family Tree Management API\n\n` +
        `**Base URL:** \`http://localhost:3002/v2\`\n\n` +
        `**Authentication:** Bearer JWT token (same as backend v1)\n\n` +
        `### Modules\n` +
        `- **Members** — CRUD thành viên + profile + avatar (async upload)\n` +
        `- **Relationships** — Quan hệ mới (BIOLOGICAL/ADOPTED/SPOUSE) + tìm tổ tiên/con cháu\n` +
        `- **Tree** — Cây gia phả full (Redis cache 1h) + subtree 4 thế hệ\n` +
        `- **Anniversaries** — Ngày giỗ (filter by member, month, upcoming)\n` +
        `- **Events** — Sự kiện dòng họ + notification queue\n` +
        `- **Media** — Thư viện media: upload mọi loại (ảnh nén lossless bằng sharp; video/audio/tài liệu upload thẳng) → Vercel Blob; phân trang/lọc/tìm kiếm + thống kê + album\n` +
        `- **Graves** — Mộ phần với tọa độ GPS + tìm kiếm gần nhất\n\n` +
        `### Queue Jobs (QStash + Redis)\n` +
        `| Queue | Trigger | Action |\n` +
        `|-------|---------|--------|\n` +
        `| avatar-upload | Create/Update member với file | Upload → Vercel Blob → cập nhật avatar_url |\n` +
        `| media-process | Upload media | Ảnh: sharp nén lossless; khác: upload thẳng → Vercel Blob (off-request) |\n` +
        `| report-generate | Create/Delete member | Tính stats → lưu Redis |\n` +
        `| notification | New member/relationship/event | Log (Phase 1) |\n`,
    )
    .setVersion('2.0.0')
    // KHÔNG đặt tên riêng cho scheme. Tên ở đây phải khớp CHÍNH XÁC với tên
    // trong `@ApiBearerAuth(...)` trên controller, nếu không Swagger UI vẫn
    // hiện ổ khoá và vẫn cho Authorize, nhưng không đính header vào request —
    // hỏng âm thầm, không có cảnh báo nào.
    //
    // Toàn bộ 13 controller đang dùng `@ApiBearerAuth()` trần ⇒ tên mặc định
    // `'bearer'`. Trước đây chỗ này đăng ký `'JWT'` nên không route nào map
    // được. Bỏ tên đi để cả hai phía cùng dùng `'bearer'`.
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      in: 'header',
      // Hiện ngay trong modal Authorize: Swagger UI TỰ thêm tiền tố `Bearer `.
      // Dán cả `Bearer <token>` vào đây sẽ tạo header `Bearer Bearer <token>`
      // ⇒ 401 khó hiểu, vì token vẫn hợp lệ mà server vẫn từ chối.
      description: 'Dán CHỈ token thô (lấy từ POST /v2/auth/login), KHÔNG kèm tiền tố "Bearer ".',
    })
    .setContact('Family Tree Team', '', '')
    .build();
}

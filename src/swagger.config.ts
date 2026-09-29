import { DocumentBuilder } from '@nestjs/swagger';

/**
 * Single source of truth for the Swagger/OpenAPI document config.
 *
 * Shared by:
 *   - src/main.ts            → `/docs` khi chạy local
 *   - src/vercel.ts          → `/docs` + `/docs-json` trên production (FE fetch)
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
        `**Base URL:** \`/v2\` (local: \`http://localhost:3002/v2\`)\n\n` +
        `**Authentication:** Bearer JWT (POST /v2/auth/login). Phân quyền theo route: docs/USERS_AND_ROLES.md\n\n` +
        `### Modules\n` +
        `- **Members** — CRUD thành viên + profile + avatar (async upload)\n` +
        `- **Relationships** — Quan hệ BIOLOGICAL/ADOPTED/SPOUSE + tìm tổ tiên/con cháu\n` +
        `- **Tree** — Cây gia phả full (Redis cache 1h) + subtree 4 thế hệ\n` +
        `- **Anniversaries** — Ngày kỵ lặp lại theo âm/dương lịch (hôm nay, sắp tới, theo tháng)\n` +
        `- **Events** — Sự kiện dòng họ\n` +
        `- **Media** — Thư viện media (ảnh nén lossless bằng sharp) → Cloudflare R2; phân trang/lọc/tìm kiếm + album\n` +
        `- **Graves / Grave areas** — Mộ phần với tọa độ GPS, khu an táng\n` +
        `- **Audit** — Lịch sử thay đổi member/quan hệ + thùng rác 30 ngày (admin)\n` +
        `- **Notifications** — Tuỳ chọn email nhắc ngày giỗ, link tắt nhắc\n` +
        `- **Export** — GEDCOM 5.5.1 + sách gia phả HTML để in\n\n` +
        `### Queue Jobs (QStash)\n` +
        `| Queue | Trigger | Action |\n` +
        `|-------|---------|--------|\n` +
        `| avatar-upload | Create/Update member với file | Upload → storage → cập nhật avatar_url |\n` +
        `| media-process | Hoàn tất upload | Ảnh: nén lossless; sinh metadata |\n` +
        `| report-generate | Create/Delete member | Tính stats → lưu Redis |\n` +
        `| generation-recompute | Đổi quan hệ cha/con | Tính lại đời cho toàn cây |\n` +
        `| account-pending | Đăng ký mới | Email báo admin |\n` +
        `| anniversary-reminder | Lịch 07:00 VN hằng ngày | Email nhắc giỗ còn 7 / 1 ngày |\n`,
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

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
        `- **Media** — Upload ảnh → nén bằng sharp → Vercel Blob\n` +
        `- **Graves** — Mộ phần với tọa độ GPS + tìm kiếm gần nhất\n\n` +
        `### Queue Jobs (QStash + Redis)\n` +
        `| Queue | Trigger | Action |\n` +
        `|-------|---------|--------|\n` +
        `| avatar-upload | Create/Update member với file | Upload → Vercel Blob → cập nhật avatar_url |\n` +
        `| image-process | Upload media | sharp resize + compress → Vercel Blob |\n` +
        `| report-generate | Create/Delete member | Tính stats → lưu Redis |\n` +
        `| notification | New member/relationship/event | Log (Phase 1) |\n`,
    )
    .setVersion('2.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'JWT',
    )
    .setContact('Family Tree Team', '', '')
    .build();
}

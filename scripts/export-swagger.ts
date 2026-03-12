/**
 * Export Swagger document to JSON and YAML files.
 * Bootstraps NestJS app without starting the HTTP server.
 *
 * Usage:
 *   cd backend-v2 && pnpm exec ts-node scripts/export-swagger.ts
 *
 * Output:
 *   docs/swagger.json
 *   docs/swagger.yaml
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';

async function exportSwagger() {
  const app = await NestFactory.create(AppModule, { logger: false });

  app.setGlobalPrefix('v2');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
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
      `### Queue Jobs (BullMQ + Redis)\n` +
      `| Queue | Trigger | Action |\n` +
      `|-------|---------|--------|\n` +
      `| avatar-upload | Create/Update member với file | Upload → Vercel Blob → cập nhật avatar_url |\n` +
      `| image-process | Upload media | sharp resize + compress → Vercel Blob |\n` +
      `| report-generate | Create/Delete member | Tính stats → lưu Redis |\n` +
      `| notification | New member/relationship/event | Log (Phase 1) |\n`
    )
    .setVersion('2.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'JWT',
    )
    .setContact('Family Tree Team', '', '')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outDir = join(__dirname, '..', 'docs');
  mkdirSync(outDir, { recursive: true });

  // Export JSON
  const jsonPath = join(outDir, 'swagger.json');
  writeFileSync(jsonPath, JSON.stringify(document, null, 2), 'utf-8');
  console.log(`✅ swagger.json → ${jsonPath}`);

  // Export YAML
  const yaml = toYaml(document);
  const yamlPath = join(outDir, 'swagger.yaml');
  writeFileSync(yamlPath, yaml, 'utf-8');
  console.log(`✅ swagger.yaml → ${yamlPath}`);

  await app.close();
  console.log('\nDone. Import into Postman, Insomnia, or host with swagger-ui-dist.');
}

/** Simple JSON→YAML converter (avoids adding yaml package dependency) */
function toYaml(obj: any, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'boolean') return obj.toString();
  if (typeof obj === 'number') return obj.toString();
  if (typeof obj === 'string') {
    if (obj.includes('\n') || obj.includes(': ') || obj.startsWith('#') || obj === '') {
      return `"${obj.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return '\n' + obj.map((v) => `${pad}- ${toYaml(v, indent + 1)}`).join('\n');
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    return '\n' + keys
      .map((k) => {
        const val = toYaml(obj[k], indent + 1);
        const isBlock = val.startsWith('\n');
        return `${pad}${k}:${isBlock ? val : ` ${val}`}`;
      })
      .join('\n');
  }
  return String(obj);
}

exportSwagger().catch((e) => {
  console.error('Export failed:', e);
  process.exit(1);
});

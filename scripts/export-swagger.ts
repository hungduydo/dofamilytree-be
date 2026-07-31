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
import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { buildSwaggerConfig } from '../src/swagger.config';

async function exportSwagger() {
  const app = await NestFactory.create(AppModule, { logger: false });

  app.setGlobalPrefix('v2');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());

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

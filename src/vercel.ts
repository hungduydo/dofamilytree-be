// Sentry PHẢI được nạp trước mọi module khác — xem instrument.ts.
import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { buildSwaggerConfig } from './swagger.config';
import express, { Express } from 'express';
import * as Sentry from '@sentry/nestjs';
import { runInBackground } from './utils/run-in-background';

let cachedServer: Express | null = null;

async function bootstrap(): Promise<Express> {
  if (cachedServer) return cachedServer;

  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ['error', 'warn'],
    // Xem ghi chú ở main.ts — QStashSignatureGuard cần req.rawBody.
    rawBody: true,
  });

  app.setGlobalPrefix('v2', { exclude: ['docs', 'docs-json', 'docs-yaml'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: [
      'http://localhost:3001',
      'https://family-website-nine.vercel.app',
      ...(process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : []),
    ],
    credentials: true,
  });

  // Cùng config với main.ts / swagger:export — trước đây production dựng một
  // DocumentBuilder riêng nên /docs trên Vercel lệch với bản local.
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  SwaggerModule.setup('docs', app, document);

  await app.init();
  cachedServer = server;
  return cachedServer;
}

export default async (req: any, res: any) => {
  const server = await bootstrap();
  // Function có thể bị đóng băng ngay khi response ghi xong — sự kiện Sentry
  // đang chờ gửi sẽ mất. Giữ function sống tới khi flush xong, chỉ khi có lỗi.
  res.on('finish', () => {
    if (res.statusCode >= 500) runInBackground(Sentry.flush(2000));
  });
  server(req, res);
};

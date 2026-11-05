// OTel rồi Sentry PHẢI được nạp trước mọi module khác — xem telemetry.ts, instrument.ts.
import './telemetry';
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
import { takePendingSentryLogs } from './utils/sentry-log-flush';
import { flushTelemetry } from './telemetry';

let cachedServer: Express | null = null;
const sentryTracing = (Sentry.getClient()?.getOptions().tracesSampleRate ?? 0) > 0;

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
  // đang chờ gửi sẽ mất. Giữ function sống tới khi flush xong: luôn flush khi
  // bật tracing (span của request vừa xong), còn không thì chỉ khi có lỗi
  // hoặc có Sentry Logs đang chờ.
  res.on('finish', () => {
    // Log ghi trong việc nền (runInBackground) được flush ở đó, khi việc xong.
    const logsPending = takePendingSentryLogs();
    if (Sentry.isEnabled() && (sentryTracing || logsPending || res.statusCode >= 500)) {
      runInBackground(Sentry.flush(2000));
    }
    // Trace thì đẩy cho mọi request (no-op khi OTel tắt).
    runInBackground(flushTelemetry());
  });
  server(req, res);
};

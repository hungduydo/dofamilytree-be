import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildSwaggerConfig } from './swagger.config';

async function bootstrap() {
  // rawBody: QStashSignatureGuard cần body THÔ để kiểm chữ ký. Thiếu cờ này
  // thì req.rawBody là undefined và MỌI job nền sẽ 401.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Exclude Swagger path from global prefix so /docs resolves correctly
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

  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3002;
  await app.listen(port);
  console.log(`API v2 running on http://localhost:${port}/v2`);
  console.log(`Swagger docs:  http://localhost:${port}/docs`);
}
bootstrap();

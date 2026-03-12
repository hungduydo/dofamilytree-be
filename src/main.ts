import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Exclude Swagger path from global prefix so /docs resolves correctly
  app.setGlobalPrefix('v2', { exclude: ['docs', 'docs-json', 'docs-yaml'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('Family Tree API v2')
    .setDescription('NestJS + Upstash Redis + QStash')
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3002;
  await app.listen(port);
  console.log(`API v2 running on http://localhost:${port}/v2`);
  console.log(`Swagger docs:  http://localhost:${port}/docs`);
}
bootstrap();

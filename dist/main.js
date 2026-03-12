"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('v2', { exclude: ['docs', 'docs-json', 'docs-yaml'] });
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
    app.enableCors();
    const config = new swagger_1.DocumentBuilder()
        .setTitle('Family Tree API v2')
        .setDescription('NestJS + Redis + BullMQ')
        .setVersion('2.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('docs', app, document);
    const port = process.env.PORT || 3002;
    await app.listen(port);
    console.log(`API v2 running on http://localhost:${port}/v2`);
    console.log(`Swagger docs:  http://localhost:${port}/docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map
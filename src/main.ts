import { NestFactory } from '@nestjs/core';
import { ConsoleLogger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true }),
  });
  configureApp(app);

  const config = new DocumentBuilder()
    .setTitle('API da Carteira Digital')
    .setDescription('API REST para gerenciamento de usuários, carteiras e transferências.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

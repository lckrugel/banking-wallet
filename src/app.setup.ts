import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { DomainErrorFilter } from './common/domain-error.filter.js';

export function configureApp(app: INestApplication): void {
  app.useGlobalFilters(new DomainErrorFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

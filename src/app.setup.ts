import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { DomainErrorFilter } from './common/domain-error.filter.js';
import { RequestLoggingMiddleware } from './common/request-logging.middleware.js';

export function configureApp(app: INestApplication): void {
  const requestLogging = new RequestLoggingMiddleware();
  app.use(requestLogging.use.bind(requestLogging));
  app.useGlobalFilters(new DomainErrorFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

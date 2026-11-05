import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type RequestWithId = Request & { requestId: string };

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const startedAt = Date.now();
    request.requestId = randomUUID();
    response.setHeader('x-request-id', request.requestId);
    response.on('finish', () => {
      const entry = {
        event: 'http_request_completed',
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      };
      if (response.statusCode >= 500) this.logger.error(entry);
      else if (response.statusCode >= 400) this.logger.warn(entry);
      else this.logger.log(entry);
    });
    next();
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from './domain-error.js';

type HttpError = { status: number; code: string; message: string };

const PUBLIC_ERRORS: Record<string, HttpError> = {
  EMAIL_ALREADY_EXISTS: {
    status: 409,
    code: 'EMAIL_ALREADY_EXISTS',
    message: 'An account with this email already exists',
  },
  USER_WALLET_EXISTS: {
    status: 409,
    code: 'USER_WALLET_EXISTS',
    message: 'User already has a wallet',
  },
  EVENT_VERSION_CONFLICT: {
    status: 409,
    code: 'EVENT_VERSION_CONFLICT',
    message: 'Wallet was changed concurrently; retry the operation',
  },
  WALLET_CONCURRENCY_CONFLICT: {
    status: 409,
    code: 'WALLET_CONCURRENCY_CONFLICT',
    message: 'Wallet was changed concurrently; retry the operation',
  },
  WALLET_NOT_FOUND: {
    status: 404,
    code: 'WALLET_NOT_FOUND',
    message: 'Wallet not found',
  },
  TRANSFER_AMOUNT_NOT_POSITIVE: {
    status: 422,
    code: 'TRANSFER_AMOUNT_NOT_POSITIVE',
    message: 'Amount must be greater than zero',
  },
  SEED_AMOUNT_NOT_POSITIVE: {
    status: 422,
    code: 'SEED_AMOUNT_NOT_POSITIVE',
    message: 'Seed amount cannot be negative',
  },
  INVALID_SEED_REFERENCE: {
    status: 422,
    code: 'INVALID_SEED_REFERENCE',
    message: 'A seed reference is required',
  },
  SEED_REFERENCE_CONFLICT: {
    status: 409,
    code: 'SEED_REFERENCE_CONFLICT',
    message: 'Seed reference was already used with a different amount',
  },
  INSUFFICIENT_FUNDS: {
    status: 422,
    code: 'INSUFFICIENT_FUNDS',
    message: 'Wallet has insufficient funds',
  },
  TRANSFER_NOT_FOUND: { status: 404, code: 'TRANSFER_NOT_FOUND', message: 'Recipient or wallet not found' },
  TRANSFER_INVALID: { status: 400, code: 'TRANSFER_INVALID', message: 'Amount must be a positive signed BIGINT decimal string' },
  SELF_TRANSFER: { status: 422, code: 'SELF_TRANSFER', message: 'Cannot transfer to yourself' },
  WALLET_BALANCE_OVERFLOW: { status: 422, code: 'WALLET_BALANCE_OVERFLOW', message: 'Recipient balance would overflow' },
  IDEMPOTENCY_KEY_REUSED: { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key was already used with a different request' },
  TRANSFER_NOT_REVERSIBLE: { status: 409, code: 'TRANSFER_NOT_REVERSIBLE', message: 'Transfer is not eligible for reversal' },
};

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = typeof http.getRequest === 'function'
      ? http.getRequest<Request & { requestId?: string }>()
      : undefined;
    let status = 500;
    let body: { statusCode: number; code: string; message: string } = {
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    };
    let errorCode = 'INTERNAL_SERVER_ERROR';

    if (exception instanceof DomainError) {
      const mapped = PUBLIC_ERRORS[exception.code];
      if (mapped) {
        status = mapped.status;
        errorCode = mapped.code;
        body = { statusCode: status, code: mapped.code, message: mapped.message };
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionBody = exception.getResponse();
      const responseObject = typeof exceptionBody === 'object' && exceptionBody !== null
        ? exceptionBody as Record<string, unknown>
        : {};
      const suppliedCode = responseObject.code;
      errorCode = typeof suppliedCode === 'string' ? suppliedCode : `HTTP_${status}`;
      body = typeof exceptionBody === 'object' && exceptionBody !== null
        ? { statusCode: status, ...responseObject } as typeof body
        : { statusCode: status, code: errorCode, message: String(exceptionBody) };
    }

    const logEntry = {
      event: 'http_request_failed',
      requestId: request?.requestId,
      method: request?.method,
      path: request?.path,
      statusCode: status,
      errorCode,
      errorType: exception instanceof Error ? exception.name : 'UnknownError',
      ...(status >= 500 && exception instanceof Error ? { stack: exception.stack } : {}),
    };
    if (status >= 500) this.logger.error(logEntry);
    else this.logger.warn(logEntry);
    response.status(status).json(body);
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
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
};

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const mapped = PUBLIC_ERRORS[exception.code];

    if (mapped) {
      response.status(mapped.status).json({
        statusCode: mapped.status,
        code: mapped.code,
        message: mapped.message,
      });
      return;
    }

    this.logger.error(`Unexpected domain error: ${exception.code}`, exception.stack);
    response.status(500).json({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
  }
}

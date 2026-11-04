import { Logger } from '@nestjs/common';
import { EmailAlreadyExists } from '../users/users.errors.js';
import { InvalidEventHistory } from '../wallet/wallet.errors.js';
import { DomainErrorFilter } from './domain-error.filter.js';
import { IdempotencyKeyReused } from '../transfers/transfer.errors.js';

describe('DomainErrorFilter', () => {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  };
  let filter: DomainErrorFilter;
  let loggerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    filter = new DomainErrorFilter();
  });

  afterEach(() => loggerSpy.mockRestore());

  it('maps known domain errors to safe HTTP responses', () => {
    filter.catch(new EmailAlreadyExists(), host as never);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 409,
      code: 'EMAIL_ALREADY_EXISTS',
      message: 'An account with this email already exists',
    });
  });

  it('hides internal consistency errors from clients', () => {
    filter.catch(new InvalidEventHistory(), host as never);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
  });

  it('maps idempotency command conflicts to a safe 409 response', () => {
    filter.catch(new IdempotencyKeyReused(), host as never);
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency key was already used with a different request',
    });
  });
});

import { DomainError } from '../common/domain-error.js';

export class UserWalletExists extends DomainError {
  readonly code = 'USER_WALLET_EXISTS';

  constructor(options?: ErrorOptions) {
    super('User already has a wallet.', options);
  }
}

export class WalletBalanceNegative extends DomainError {
  readonly code = 'WALLET_BALANCE_NEGATIVE';

  constructor(options?: ErrorOptions) {
    super('Wallet balance cannot be negative.', options);
  }
}

export class InsufficientFunds extends DomainError {
  readonly code = 'INSUFFICIENT_FUNDS';

  constructor() {
    super('Wallet has insufficient funds.');
  }
}

export class InvalidWalletVersion extends DomainError {
  readonly code = 'INVALID_WALLET_VERSION';

  constructor() {
    super('Wallet has invalid version.');
  }
}

export class TransferAmountNotPositive extends DomainError {
  readonly code = 'TRANSFER_AMOUNT_NOT_POSITIVE';

  constructor() {
    super('The amount to credit/debit must be a positive value');
  }
}

export class SeedAmountNotPositive extends DomainError {
  readonly code = 'SEED_AMOUNT_NOT_POSITIVE';

  constructor() {
    super('The amount to seed a wallet must be a positive value');
  }
}

export class InvalidSeedReference extends DomainError {
  readonly code = 'INVALID_SEED_REFERENCE';

  constructor() {
    super('A seed reference is required.');
  }
}

export class SeedReferenceConflict extends DomainError {
  readonly code = 'SEED_REFERENCE_CONFLICT';

  constructor() {
    super('A seed reference was already used with a different amount.');
  }
}

export class InvalidEventVersioning extends DomainError {
  readonly code = 'INVALID_EVENT_VERSIONING';

  constructor() {
    super('The event history contains invalid versioning.');
  }
}

export class InvalidEventHistory extends DomainError {
  readonly code = 'INVALID_EVENT_HISTORY';

  constructor(options?: ErrorOptions) {
    super('Invalid event history for wallet.', options);
  }
}

export class WalletNotFound extends DomainError {
  readonly code = 'WALLET_NOT_FOUND';

  constructor() {
    super('Wallet not found.');
  }
}

export class WalletConcurrencyConflict extends DomainError {
  readonly code = 'WALLET_CONCURRENCY_CONFLICT';

  constructor() {
    super('Wallet was changed by another operation.');
  }
}

import { DomainError } from '../common/domain-error.js';
export class TransferNotFound extends DomainError {
  readonly code = 'TRANSFER_NOT_FOUND';
  constructor(message = 'Recipient or wallet not found.') { super(message); }
}
export class TransferInvalid extends DomainError {
  readonly code = 'TRANSFER_INVALID';
  constructor(message = 'Invalid transfer amount.') { super(message); }
}
export class SelfTransfer extends DomainError {
  readonly code = 'SELF_TRANSFER';
  constructor() { super('Cannot transfer to yourself.'); }
}
export class BalanceOverflow extends DomainError {
  readonly code = 'WALLET_BALANCE_OVERFLOW';
  constructor() { super('Recipient balance would overflow.'); }
}

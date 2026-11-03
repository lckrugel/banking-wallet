import { DomainError } from '../common/domain-error.js';

export class EmailAlreadyExists extends DomainError {
  readonly code = 'EMAIL_ALREADY_EXISTS';

  constructor(options?: ErrorOptions) {
    super('An account with this email already exists', options);
  }
}

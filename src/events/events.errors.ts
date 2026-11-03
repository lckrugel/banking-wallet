import { DomainError } from '../common/domain-error.js';

export class EventVersionConflict extends DomainError {
  readonly code = 'EVENT_VERSION_CONFLICT';

  constructor(options?: ErrorOptions) {
    super('An event already exists for this aggregate version', options);
  }
}

export class InvalidEventSequence extends DomainError {
  readonly code = 'INVALID_EVENT_SEQUENCE';

  constructor() {
    super('Events must have contiguous versions for one aggregate');
  }
}

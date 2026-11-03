import { Injectable } from '@nestjs/common';
import type { NewEvent } from '../database/drizzle.schema.js';
import type { DatabaseTransaction } from '../database/database.types.js';
import { EventsRepository } from './events.repository.js';
import { EventVersionConflict, InvalidEventSequence } from './events.errors.js';

@Injectable()
export class EventsService {
  constructor(private readonly events: EventsRepository) {}

  async append(
    tx: DatabaseTransaction,
    input: {
      aggregateType: NewEvent['aggregateType'];
      aggregateId: string;
      expectedVersion: number;
      events: readonly NewEvent[];
    },
  ): Promise<void> {
    const { aggregateType, aggregateId, expectedVersion, events } = input;
    if (events.length === 0) return;

    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      throw new InvalidEventSequence();
    }

    for (const [index, event] of events.entries()) {
      if (
        event.aggregateType !== aggregateType ||
        event.aggregateId !== aggregateId ||
        event.version !== expectedVersion + index + 1
      ) {
        throw new InvalidEventSequence();
      }
    }

    const lastPersistedVersion = await this.events.findLastVersion(
      tx,
      aggregateType,
      aggregateId,
    );
    if (lastPersistedVersion !== expectedVersion) {
      throw new EventVersionConflict();
    }

    await this.events.insert(tx, events);
  }
}

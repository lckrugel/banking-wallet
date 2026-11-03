import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import * as schema from '../database/drizzle.schema.js';
import type { DatabaseTransaction } from '../database/database.types.js';
import type { NewEvent } from '../database/drizzle.schema.js';
import { isPostgresConstraintViolation } from '../database/postgres-error.js';
import { EventVersionConflict, InvalidEventSequence } from './events.errors.js';

@Injectable()
export class EventsRepository {
  async findLastVersion(
    tx: DatabaseTransaction,
    aggregateType: NewEvent['aggregateType'],
    aggregateId: string,
  ): Promise<number> {
    const [lastEvent] = await tx
      .select({ version: schema.eventsTable.version })
      .from(schema.eventsTable)
      .where(
        and(
          eq(schema.eventsTable.aggregateType, aggregateType),
          eq(schema.eventsTable.aggregateId, aggregateId),
        ),
      )
      .orderBy(desc(schema.eventsTable.version))
      .limit(1);
    return lastEvent?.version ?? 0;
  }

  async insert(tx: DatabaseTransaction, events: readonly NewEvent[]): Promise<void> {
    if (events.length === 0) return;

    try {
      await tx.insert(schema.eventsTable).values([...events]);
    } catch (error) {
      if (
        isPostgresConstraintViolation(
          error,
          '23505',
          'uq_events_aggregate_version',
        )
      ) {
        throw new EventVersionConflict({ cause: error });
      }
      if (
        isPostgresConstraintViolation(
          error,
          '23514',
          'ck_event_version_positive',
        )
      ) {
        throw new InvalidEventSequence();
      }
      throw error;
    }
  }

  async findWalletEvents(tx: DatabaseTransaction, walletId: string) {
    return tx
      .select({
        version: schema.eventsTable.version,
        eventType: schema.eventsTable.eventType,
        payload: schema.eventsTable.payload,
      })
      .from(schema.eventsTable)
      .where(
        and(
          eq(schema.eventsTable.aggregateType, 'WALLET'),
          eq(schema.eventsTable.aggregateId, walletId),
        ),
      )
      .orderBy(asc(schema.eventsTable.version));
  }
}

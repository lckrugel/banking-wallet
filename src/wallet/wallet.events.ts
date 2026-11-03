import type { Event, NewEvent } from '../database/drizzle.schema.js';
import { InvalidEventHistory } from './wallet.errors.js';
import type { WalletEvent } from './wallet.entity.js';

export function toWalletEventRecords(
  walletId: string,
  events: readonly WalletEvent[],
  operationId: string | null = null,
): NewEvent[] {
  return events.map((event) => ({
    aggregateType: 'WALLET',
    aggregateId: walletId,
    version: event.version,
    eventType: event.type,
    payload: eventPayload(event),
    operationId,
  }));
}

function eventPayload(event: WalletEvent): Record<string, string> {
  if (event.type === 'WALLET_CREATED') return {};
  if (event.type === 'SEED_FUNDS') {
    return {
      amountCents: event.amountCents.toString(),
      seedReference: event.seedReference,
    };
  }
  return { amountCents: event.amountCents.toString() };
}

export function fromWalletEventRecords(
  records: readonly Pick<Event, 'version' | 'eventType' | 'payload'>[],
): WalletEvent[] {
  return records.map((record) => {
    if (record.eventType === 'WALLET_CREATED') {
      return { type: record.eventType, version: record.version };
    }

    const payload: unknown = record.payload;
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('amountCents' in payload) ||
      typeof payload.amountCents !== 'string' ||
      !/^\d+$/.test(payload.amountCents)
    ) {
      throw new InvalidEventHistory();
    }

    const amountCents = BigInt(payload.amountCents);
    if (record.eventType === 'SEED_FUNDS') {
      if (
        !('seedReference' in payload) ||
        typeof payload.seedReference !== 'string' ||
        payload.seedReference.trim().length === 0
      ) {
        throw new InvalidEventHistory();
      }
      return {
        type: record.eventType,
        version: record.version,
        amountCents,
        seedReference: payload.seedReference,
      };
    }

    return {
      type: record.eventType,
      version: record.version,
      amountCents,
    };
  });
}

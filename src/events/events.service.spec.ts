import type { DatabaseTransaction } from '../database/database.types.js';
import type { NewEvent } from '../database/drizzle.schema.js';
import { EventsRepository } from './events.repository.js';
import { EventsService } from './events.service.js';
import { InvalidEventSequence } from './events.errors.js';

describe('EventsService', () => {
  const tx = {} as DatabaseTransaction;
  const events = { insert: vi.fn(), findLastVersion: vi.fn() };
  let service: EventsService;

  beforeEach(() => {
    vi.clearAllMocks();
    events.findLastVersion.mockResolvedValue(1);
    service = new EventsService(events as unknown as EventsRepository);
  });

  const event = (version: number): NewEvent => ({
    aggregateType: 'WALLET',
    aggregateId: 'wallet-id',
    version,
    eventType: version === 1 ? 'WALLET_CREATED' : 'FUNDS_CREDITED',
    payload: version === 1 ? {} : { amountCents: '100' },
  });

  it('persists a contiguous batch starting after the expected version', async () => {
    await service.append(tx, {
      aggregateType: 'WALLET',
      aggregateId: 'wallet-id',
      expectedVersion: 1,
      events: [event(2), event(3)],
    });

    expect(events.insert).toHaveBeenCalledWith(tx, [event(2), event(3)]);
    expect(events.findLastVersion).toHaveBeenCalledWith(
      tx,
      'WALLET',
      'wallet-id',
    );
  });

  it.each([
    { name: 'a version gap', events: [event(2), event(4)] },
    { name: 'a duplicate version', events: [event(2), event(2)] },
    {
      name: 'an event for another aggregate',
      events: [{ ...event(2), aggregateId: 'other-wallet' }],
    },
  ])('rejects $name before persistence', async ({ events: batch }) => {
    await expect(
      service.append(tx, {
        aggregateType: 'WALLET',
        aggregateId: 'wallet-id',
        expectedVersion: 1,
        events: batch,
      }),
    ).rejects.toBeInstanceOf(InvalidEventSequence);
    expect(events.insert).not.toHaveBeenCalled();
  });

  it('rejects an append based on a stale expected version', async () => {
    events.findLastVersion.mockResolvedValue(2);

    await expect(
      service.append(tx, {
        aggregateType: 'WALLET',
        aggregateId: 'wallet-id',
        expectedVersion: 1,
        events: [event(2)],
      }),
    ).rejects.toMatchObject({ code: 'EVENT_VERSION_CONFLICT' });
    expect(events.insert).not.toHaveBeenCalled();
  });
});

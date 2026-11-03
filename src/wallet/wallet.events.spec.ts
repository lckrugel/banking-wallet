import {
  fromWalletEventRecords,
  toWalletEventRecords,
} from './wallet.events.js';

describe('toWalletEventRecords', () => {
  it('stores monetary amounts as decimal strings and associates the operation', () => {
    expect(
      toWalletEventRecords(
        'wallet-id',
        [
          {
            type: 'FUNDS_DEBITED',
            version: 2,
            amountCents: 12345n,
          },
        ],
        'transfer-id',
      ),
    ).toEqual([
      {
        aggregateType: 'WALLET',
        aggregateId: 'wallet-id',
        version: 2,
        eventType: 'FUNDS_DEBITED',
        payload: { amountCents: '12345' },
        operationId: 'transfer-id',
      },
    ]);
  });
});

it('round-trips traceable seed events through the persisted payload', () => {
  const records = toWalletEventRecords('wallet-id', [
    {
      type: 'SEED_FUNDS',
      version: 2,
      amountCents: 12345n,
      seedReference: 'demo-fixture-2026',
    },
  ]);

  expect(records[0].payload).toEqual({
    amountCents: '12345',
    seedReference: 'demo-fixture-2026',
  });
  expect(
    fromWalletEventRecords([
      {
        version: records[0].version,
        eventType: records[0].eventType,
        payload: records[0].payload,
      },
    ]),
  ).toEqual([
    {
      type: 'SEED_FUNDS',
      version: 2,
      amountCents: 12345n,
      seedReference: 'demo-fixture-2026',
    },
  ]);
});

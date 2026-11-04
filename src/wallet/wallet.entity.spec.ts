import { Wallet, WalletEvent } from './wallet.entity.js';
import {
  InvalidEventHistory,
  InvalidEventVersioning,
  InvalidSeedReference,
  InvalidWalletVersion,
  InsufficientFunds,
  SeedAmountNotPositive,
  TransferAmountNotPositive,
  WalletBalanceNegative,
} from './wallet.errors.js';

describe('WalletEntity', () => {
  it('creates a new wallet for user', () => {
    const userId = 'user-id';
    const wallet = Wallet.createWallet(userId);
    expect(wallet).toBeInstanceOf(Wallet);
    expect(wallet.id).toBeTruthy();
    expect(wallet.userId).toBe(userId);
    expect(wallet.balanceCents).toBe(0n);
    expect(wallet.version).toBe(1);
    expect(wallet.pendingEvents).length(1);
    expect(wallet.pendingEvents[0].type).toBe('WALLET_CREATED');
  });

  it('instantiates a wallet from snapshot', () => {
    const snapshot = {
      id: 'wallet-id',
      userId: 'user-id',
      balanceCents: 10_000n,
      version: 12,
    };
    const wallet = Wallet.fromSnapshot(snapshot);
    expect(wallet).toBeInstanceOf(Wallet);
    expect({
      id: wallet.id,
      userId: wallet.userId,
      balanceCents: wallet.balanceCents,
      version: wallet.version,
    }).toMatchObject(snapshot);
    expect(wallet.pendingEvents).length(0);
  });

  it.each([
    [
      'unitialized version',
      { id: 'wallet-id', userId: 'user-id', balanceCents: 500n, version: 0 },
    ],
    [
      'negative version',
      { id: 'wallet-id', userId: 'user-id', balanceCents: 500n, version: -2 },
    ],
  ])('rejects building wallet from snapshot with %s', (_, snapshot) => {
    expect(() => Wallet.fromSnapshot(snapshot)).toThrow(InvalidWalletVersion);
  });

  it('rejects building wallet from snapshot with invalid balance', () => {
    const snapshot = {
      id: 'wallet-id',
      userId: 'user-id',
      balanceCents: -10_000n,
      version: 12,
    };
    expect(() => Wallet.fromSnapshot(snapshot)).toThrow(WalletBalanceNegative);
  });

  it('replays a valid event history without mutating the input or creating pending events', () => {
    const history = [
      { type: 'WALLET_CREATED', version: 1 },
      {
        type: 'SEED_FUNDS',
        version: 2,
        amountCents: 500n,
        seedReference: 'fixture-seed',
      },
      { type: 'FUNDS_CREDITED', version: 3, amountCents: 250n },
      { type: 'FUNDS_DEBITED', version: 4, amountCents: 100n },
    ] as const;
    const originalHistory = Array.from(history);

    const wallet = Wallet.fromHistory('wallet-id', 'user-id', [...history]);

    expect(wallet.id).toBe('wallet-id');
    expect(wallet.userId).toBe('user-id');
    expect(wallet.balanceCents).toBe(650n);
    expect(wallet.version).toBe(4);
    expect(wallet.pendingEvents).toEqual([]);
    expect(history).toEqual(originalHistory);
  });

  it.each([
    { name: 'empty history', history: [] },
    {
      name: 'history without creation event',
      history: [
        {
          type: 'SEED_FUNDS',
          version: 1,
          amountCents: 1n,
          seedReference: 'seed-1',
        },
      ],
    },
    {
      name: 'multiple creation events',
      history: [
        { type: 'WALLET_CREATED', version: 1 },
        { type: 'WALLET_CREATED', version: 2 },
      ],
    },
  ])('rejects invalid event history: $name', ({ history }) => {
    expect(() =>
      Wallet.fromHistory('wallet-id', 'user-id', history as WalletEvent[]),
    ).toThrow(InvalidEventHistory);
  });

  it('rejects event history with duplicated versions', () => {
    expect(() =>
      Wallet.fromHistory('wallet-id', 'user-id', [
        { type: 'WALLET_CREATED', version: 1 },
        {
          type: 'SEED_FUNDS',
          version: 1,
          amountCents: 10n,
          seedReference: 'seed-1',
        },
      ]),
    ).toThrow(InvalidEventHistory);
  });

  it('rejects event history when wallet creation is not version one', () => {
    expect(() =>
      Wallet.fromHistory('wallet-id', 'user-id', [
        { type: 'WALLET_CREATED', version: 2 },
      ]),
    ).toThrow(InvalidEventVersioning);
  });

  it('rejects event history with version gaps', () => {
    expect(() =>
      Wallet.fromHistory('wallet-id', 'user-id', [
        { type: 'WALLET_CREATED', version: 1 },
        {
          type: 'SEED_FUNDS',
          version: 3,
          amountCents: 10n,
          seedReference: 'seed-1',
        },
      ]),
    ).toThrow(InvalidEventVersioning);
  });

  it('rejects invalid amounts and overdrafts while replaying history', () => {
    const created = { type: 'WALLET_CREATED', version: 1 } as const;
    expect(() =>
      Wallet.fromHistory('wallet-id', 'user-id', [
        created,
        { type: 'FUNDS_CREDITED', version: 2, amountCents: 0n },
      ]),
    ).toThrow(TransferAmountNotPositive);
    expect(() =>
      Wallet.fromHistory('wallet-id', 'user-id', [
        created,
        {
          type: 'SEED_FUNDS',
          version: 2,
          amountCents: -1n,
          seedReference: 'seed-1',
        },
      ]),
    ).toThrow(SeedAmountNotPositive);
    expect(() =>
      Wallet.fromHistory('wallet-id', 'user-id', [
        created,
        { type: 'FUNDS_DEBITED', version: 2, amountCents: 1n },
      ]),
    ).toThrow(WalletBalanceNegative);
  });

  it('credits and debits balances, advancing version and recording pending events', () => {
    const wallet = Wallet.createWallet('user-id');
    wallet.seed(1_000n, 'fixture-seed');
    wallet.credit(250n);
    wallet.debit(100n);

    expect(wallet.balanceCents).toBe(1_150n);
    expect(wallet.version).toBe(4);
    expect(wallet.pendingEvents).toEqual([
      { type: 'WALLET_CREATED', version: 1 },
      {
        type: 'SEED_FUNDS',
        version: 2,
        amountCents: 1_000n,
        seedReference: 'fixture-seed',
      },
      { type: 'FUNDS_CREDITED', version: 3, amountCents: 250n },
      { type: 'FUNDS_DEBITED', version: 4, amountCents: 100n },
    ]);
  });

  it.each([0n, -1n])(
    'rejects non-positive credit/debit amounts: %s',
    (amount) => {
      const wallet = Wallet.createWallet('user-id');
      expect(() => wallet.credit(amount)).toThrow(TransferAmountNotPositive);
      expect(() => wallet.debit(amount)).toThrow(TransferAmountNotPositive);
      expect(wallet.balanceCents).toBe(0n);
      expect(wallet.version).toBe(1);
      expect(wallet.pendingEvents).toHaveLength(1);
    },
  );

  it('rejects debits that would make the balance negative without changing state', () => {
    const wallet = Wallet.createWallet('user-id');
    wallet.seed(10n, 'fixture-seed');
    expect(() => wallet.debit(11n)).toThrow(InsufficientFunds);
    expect(wallet.balanceCents).toBe(10n);
    expect(wallet.version).toBe(2);
    expect(wallet.pendingEvents).toHaveLength(2);
  });

  it('allows zero seeding and rejects negative seeding', () => {
    const wallet = Wallet.createWallet('user-id');
    wallet.seed(0n, 'zero-seed');
    expect(wallet.balanceCents).toBe(0n);
    expect(wallet.version).toBe(2);
    expect(() => wallet.seed(-1n, 'negative-seed')).toThrow(
      SeedAmountNotPositive,
    );
    expect(wallet.version).toBe(2);
    expect(wallet.pendingEvents).toHaveLength(2);
  });

  it('requires a traceable seed reference', () => {
    const wallet = Wallet.createWallet('user-id');
    expect(() => wallet.seed(100n, '  ')).toThrow(InvalidSeedReference);
    expect(wallet.balanceCents).toBe(0n);
    expect(wallet.version).toBe(1);
  });

  it('returns a copy of pending events', () => {
    const wallet = Wallet.createWallet('user-id');
    const pendingEvents = wallet.pendingEvents;
    const mutableEvents = [...pendingEvents];
    Reflect.set(mutableEvents[0], 'version', 99);
    mutableEvents.pop();
    expect(wallet.pendingEvents).not.toBe(pendingEvents);
    expect(wallet.pendingEvents).toEqual([
      { type: 'WALLET_CREATED', version: 1 },
    ]);
  });
});

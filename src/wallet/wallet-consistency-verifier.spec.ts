import type { DatabaseTransaction } from '../database/database.types.js';
import type { UnitOfWork } from '../database/unit-of-work.js';
import { EventsRepository } from '../events/events.repository.js';
import { WalletRepository } from './wallet.repository.js';
import { WalletConsistencyVerifier } from './wallet-consistency-verifier.js';

describe('WalletConsistencyVerifier', () => {
  const tx = { execute: vi.fn().mockResolvedValue(undefined) };
  const uow = {
    execute: vi.fn(
      <T>(work: (transaction: DatabaseTransaction) => Promise<T>) =>
        work(tx as unknown as DatabaseTransaction),
    ),
  };
  const wallets = { findById: vi.fn() };
  const events = { findWalletEvents: vi.fn() };
  let verifier: WalletConsistencyVerifier;

  beforeEach(() => {
    vi.clearAllMocks();
    tx.execute.mockResolvedValue(undefined);
    verifier = new WalletConsistencyVerifier(
      uow as unknown as UnitOfWork,
      wallets as unknown as WalletRepository,
      events as unknown as EventsRepository,
    );
  });

  it('reports a projection consistent with its event stream', async () => {
    wallets.findById.mockResolvedValue({
      id: 'wallet-id',
      userId: 'user-id',
      balanceCents: 125n,
      version: 2,
    });
    events.findWalletEvents.mockResolvedValue([
      { version: 1, eventType: 'WALLET_CREATED', payload: {} },
      {
        version: 2,
        eventType: 'SEED_FUNDS',
        payload: { amountCents: '125', seedReference: 'seed-1' },
      },
    ]);

    await expect(verifier.verify('wallet-id')).resolves.toEqual({
      consistent: true,
      walletId: 'wallet-id',
      version: 2,
      balanceCents: '125',
    });
    expect(tx.execute).toHaveBeenCalledOnce();
  });

  it('reports state drift without mutating the projection', async () => {
    wallets.findById.mockResolvedValue({
      id: 'wallet-id',
      userId: 'user-id',
      balanceCents: 126n,
      version: 2,
    });
    events.findWalletEvents.mockResolvedValue([
      { version: 1, eventType: 'WALLET_CREATED', payload: {} },
      {
        version: 2,
        eventType: 'SEED_FUNDS',
        payload: { amountCents: '125', seedReference: 'seed-1' },
      },
    ]);

    await expect(verifier.verify('wallet-id')).resolves.toMatchObject({
      consistent: false,
      reason: 'STATE_MISMATCH',
      projection: { balanceCents: '126', version: 2 },
      reconstructed: { balanceCents: '125', version: 2 },
    });
  });

  it('reports a missing projection', async () => {
    wallets.findById.mockResolvedValue(null);
    events.findWalletEvents.mockResolvedValue([]);

    await expect(verifier.verify('wallet-id')).resolves.toMatchObject({
      consistent: false,
      reason: 'PROJECTION_MISSING',
    });
  });
});

import type { DatabaseTransaction } from '../database/database.types.js';
import type { UnitOfWork } from '../database/unit-of-work.js';
import { EventsRepository } from '../events/events.repository.js';
import { EventsService } from '../events/events.service.js';
import { WalletRepository } from './wallet.repository.js';
import { WalletService } from './wallet.service.js';
import { WalletNotFound } from './wallet.errors.js';

describe('WalletService', () => {
  const tx = {} as DatabaseTransaction;
  const uow = {
    execute: vi.fn(
      <T>(work: (transaction: DatabaseTransaction) => Promise<T>) => work(tx),
    ),
  };
  const walletRepository = {
    findUserWallet: vi.fn(),
    insertProjection: vi.fn(),
    updateBalanceIfVersion: vi.fn(),
  };
  const eventsRepository = {
    insert: vi.fn(),
    findWalletEvents: vi.fn(),
  };
  const eventsService = { append: vi.fn() };
  let service: WalletService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WalletService(
      uow as unknown as UnitOfWork,
      walletRepository as unknown as WalletRepository,
      eventsRepository as unknown as EventsRepository,
      eventsService as unknown as EventsService,
    );
  });

  it('reads the user wallet inside a unit of work', async () => {
    walletRepository.findUserWallet.mockResolvedValue({
      id: 'wallet-id',
      userId: 'user-id',
      balanceCents: 150n,
      version: 1,
    });

    const wallet = await service.findUserWallet('user-id');

    expect(uow.execute).toHaveBeenCalledOnce();
    expect(walletRepository.findUserWallet).toHaveBeenCalledWith(tx, 'user-id');
    expect(wallet.id).toBe('wallet-id');
  });

  it('throws when the user has no wallet', async () => {
    walletRepository.findUserWallet.mockResolvedValue(null);

    await expect(service.findUserWallet('user-id')).rejects.toBeInstanceOf(
      WalletNotFound,
    );
  });

  it('persists the wallet projection and creation event in the caller transaction', async () => {
    const wallet = await service.createForUser(tx, 'user-id');

    expect(walletRepository.insertProjection).toHaveBeenCalledWith(tx, wallet);
    expect(eventsService.append).toHaveBeenCalledWith(tx, {
      aggregateType: 'WALLET',
      aggregateId: wallet.id,
      expectedVersion: 0,
      events: [
        {
        aggregateType: 'WALLET',
        aggregateId: wallet.id,
        version: 1,
        eventType: 'WALLET_CREATED',
        payload: {},
        operationId: null,
        },
      ],
    });
  });

  it('replays persisted events into a wallet aggregate', async () => {
    eventsRepository.findWalletEvents.mockResolvedValue([
      { version: 1, eventType: 'WALLET_CREATED', payload: {} },
      {
        version: 2,
        eventType: 'FUNDS_CREDITED',
        payload: { amountCents: '725' },
      },
    ]);

    const wallet = await service.replayWalletHistory('wallet-id', 'user-id');

    expect(eventsRepository.findWalletEvents).toHaveBeenCalledWith(
      tx,
      'wallet-id',
    );
    expect(wallet.balanceCents).toBe(725n);
    expect(wallet.version).toBe(2);
  });

  it('persists a traceable seed and advances the projection version optimistically', async () => {
    walletRepository.findUserWallet.mockResolvedValue({
      id: 'wallet-id',
      userId: 'user-id',
      balanceCents: 100n,
      version: 2,
    });
    eventsRepository.findWalletEvents.mockResolvedValue([
      { version: 1, eventType: 'WALLET_CREATED', payload: {} },
      {
        version: 2,
        eventType: 'SEED_FUNDS',
        payload: { amountCents: '100', seedReference: 'initial-fixture' },
      },
    ]);
    walletRepository.updateBalanceIfVersion.mockResolvedValue({
      id: 'wallet-id',
      userId: 'user-id',
      balanceCents: 150n,
      version: 3,
    });

    const wallet = await service.seedUserWallet(
      'user-id',
      50n,
      'second-fixture',
    );

    expect(walletRepository.updateBalanceIfVersion).toHaveBeenCalledWith(tx, {
      walletId: 'wallet-id',
      expectedVersion: 2,
      newBalance: 150n,
      newVersion: 3,
    });
    expect(eventsService.append).toHaveBeenCalledWith(tx, {
      aggregateType: 'WALLET',
      aggregateId: 'wallet-id',
      expectedVersion: 2,
      events: [
        {
          aggregateType: 'WALLET',
          aggregateId: 'wallet-id',
          version: 3,
          eventType: 'SEED_FUNDS',
          payload: {
            amountCents: '50',
            seedReference: 'second-fixture',
          },
          operationId: null,
        },
      ],
    });
    expect(wallet.balanceCents).toBe(150n);
    expect(wallet.version).toBe(3);
  });

  it('does not apply the same seed reference twice', async () => {
    walletRepository.findUserWallet.mockResolvedValue({
      id: 'wallet-id',
      userId: 'user-id',
      balanceCents: 100n,
      version: 2,
    });
    eventsRepository.findWalletEvents.mockResolvedValue([
      { version: 1, eventType: 'WALLET_CREATED', payload: {} },
      {
        version: 2,
        eventType: 'SEED_FUNDS',
        payload: { amountCents: '100', seedReference: 'initial-fixture' },
      },
    ]);

    const wallet = await service.seedUserWallet(
      'user-id',
      100n,
      'initial-fixture',
    );

    expect(wallet.balanceCents).toBe(100n);
    expect(wallet.version).toBe(2);
    expect(walletRepository.updateBalanceIfVersion).not.toHaveBeenCalled();
    expect(eventsService.append).not.toHaveBeenCalled();
  });
});

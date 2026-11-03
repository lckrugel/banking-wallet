import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseTransaction } from '../database/database.types.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../database/unit-of-work.js';
import { EventsRepository } from '../events/events.repository.js';
import { EventsService } from '../events/events.service.js';
import { InvalidEventHistory } from './wallet.errors.js';
import {
  SeedReferenceConflict,
  WalletNotFound,
} from './wallet.errors.js';
import { Wallet, type WalletEvent } from './wallet.entity.js';
import {
  fromWalletEventRecords,
  toWalletEventRecords,
} from './wallet.events.js';
import { WalletRepository } from './wallet.repository.js';

@Injectable()
export class WalletService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly walletRepository: WalletRepository,
    private readonly eventsRepository: EventsRepository,
    private readonly eventsService: EventsService,
  ) {}

  async findUserWallet(userId: string): Promise<Wallet> {
    return this.uow.execute(async (tx) => {
      const snapshot = await this.walletRepository.findUserWallet(tx, userId);
      if (!snapshot) throw new WalletNotFound();
      return Wallet.fromSnapshot(snapshot);
    });
  }

  async createForUser(
    tx: DatabaseTransaction,
    userId: string,
  ): Promise<Wallet> {
    const wallet = Wallet.createWallet(userId);
    await this.walletRepository.insertProjection(tx, wallet);
    await this.eventsService.append(tx, {
      aggregateType: 'WALLET',
      aggregateId: wallet.id,
      expectedVersion: 0,
      events: toWalletEventRecords(wallet.id, wallet.pendingEvents),
    });
    return wallet;
  }

  async seedUserWallet(
    userId: string,
    amountCents: bigint,
    seedReference: string,
  ): Promise<Wallet> {
    return this.uow.execute(async (tx) => {
      const snapshot = await this.walletRepository.findUserWallet(tx, userId);
      if (!snapshot) throw new WalletNotFound();

      const rows = await this.eventsRepository.findWalletEvents(tx, snapshot.id);
      const existingSeed = rows.find(
        (row) =>
          row.eventType === 'SEED_FUNDS' &&
          typeof row.payload === 'object' &&
          row.payload !== null &&
          'seedReference' in row.payload &&
          row.payload.seedReference === seedReference,
      );
      if (existingSeed) {
        if (
          typeof existingSeed.payload === 'object' &&
          existingSeed.payload !== null &&
          'amountCents' in existingSeed.payload &&
          existingSeed.payload.amountCents === amountCents.toString()
        ) {
          return Wallet.fromSnapshot(snapshot);
        }
        throw new SeedReferenceConflict();
      }

      const wallet = Wallet.fromSnapshot(snapshot);
      wallet.seed(amountCents, seedReference);
      await this.persistChanges(tx, snapshot.version, wallet);
      return wallet;
    });
  }

  async persistChanges(
    tx: DatabaseTransaction,
    expectedVersion: number,
    wallet: Wallet,
    operationId: string | null = null,
  ): Promise<void> {
    const pendingEvents = wallet.pendingEvents;
    if (pendingEvents.length === 0) return;

    await this.walletRepository.updateBalanceIfVersion(tx, {
      walletId: wallet.id,
      expectedVersion,
      newBalance: wallet.balanceCents,
      newVersion: wallet.version,
    });
    await this.eventsService.append(tx, {
      aggregateType: 'WALLET',
      aggregateId: wallet.id,
      expectedVersion,
      events: toWalletEventRecords(wallet.id, pendingEvents, operationId),
    });
  }

  async replayWalletHistory(walletId: string, userId: string): Promise<Wallet> {
    return this.uow.execute(async (tx) => {
      const rows = await this.eventsRepository.findWalletEvents(tx, walletId);
      const history: WalletEvent[] = fromWalletEventRecords(rows);
      try {
        return Wallet.fromHistory(walletId, userId, history);
      } catch (error) {
        if (error instanceof InvalidEventHistory) throw error;
        throw new InvalidEventHistory({ cause: error });
      }
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { UNIT_OF_WORK, type UnitOfWork } from '../database/unit-of-work.js';
import { DomainError } from '../common/domain-error.js';
import { EventsRepository } from '../events/events.repository.js';
import { fromWalletEventRecords } from './wallet.events.js';
import { WalletRepository } from './wallet.repository.js';
import { Wallet } from './wallet.entity.js';

export type WalletVerificationResult =
  | {
      consistent: true;
      walletId: string;
      version: number;
      balanceCents: string;
    }
  | {
      consistent: false;
      walletId: string;
      reason: 'PROJECTION_MISSING' | 'INVALID_EVENT_HISTORY' | 'STATE_MISMATCH';
      projection?: { balanceCents: string; version: number };
      reconstructed?: { balanceCents: string; version: number };
    };

@Injectable()
export class WalletConsistencyVerifier {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly wallets: WalletRepository,
    private readonly events: EventsRepository,
  ) {}

  verify(walletId: string): Promise<WalletVerificationResult> {
    return this.uow.execute(async (tx) => {
      await tx.execute(
        sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`,
      );

      const [snapshot, rows] = await Promise.all([
        this.wallets.findById(tx, walletId),
        this.events.findWalletEvents(tx, walletId),
      ]);

      if (!snapshot) {
        return {
          consistent: false,
          walletId,
          reason: 'PROJECTION_MISSING',
        };
      }

      let reconstructed: Wallet;
      try {
        const history = fromWalletEventRecords(rows);
        reconstructed = Wallet.fromHistory(walletId, snapshot.userId, history);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        return {
          consistent: false,
          walletId,
          reason: 'INVALID_EVENT_HISTORY',
          projection: {
            balanceCents: snapshot.balanceCents.toString(),
            version: snapshot.version,
          },
        };
      }

      if (
        reconstructed.balanceCents !== snapshot.balanceCents ||
        reconstructed.version !== snapshot.version
      ) {
        return {
          consistent: false,
          walletId,
          reason: 'STATE_MISMATCH',
          projection: {
            balanceCents: snapshot.balanceCents.toString(),
            version: snapshot.version,
          },
          reconstructed: {
            balanceCents: reconstructed.balanceCents.toString(),
            version: reconstructed.version,
          },
        };
      }

      return {
        consistent: true,
        walletId,
        version: snapshot.version,
        balanceCents: snapshot.balanceCents.toString(),
      };
    });
  }
}

import { Injectable } from '@nestjs/common';
import * as schema from '../database/drizzle.schema.js';
import { DatabaseTransaction } from '../database/database.types.js';
import {
  UserWalletExists,
  WalletBalanceNegative,
  WalletConcurrencyConflict,
  InvalidWalletVersion,
} from './wallet.errors.js';
import { and, eq } from 'drizzle-orm';
import type { Wallet, WalletSnapshot } from './wallet.entity.js';
import { isPostgresConstraintViolation } from '../database/postgres-error.js';

@Injectable()
export class WalletRepository {
  private readonly walletsTable;
  constructor() {
    this.walletsTable = schema.walletsTable;
  }

  async insertProjection(
    tx: DatabaseTransaction,
    pendingWallet: Wallet,
  ): Promise<WalletSnapshot> {
    try {
      const [wallet] = await tx
        .insert(schema.walletsTable)
        .values({
          id: pendingWallet.id,
          userId: pendingWallet.userId,
          version: pendingWallet.version,
          balanceCents: pendingWallet.balanceCents,
        })
        .returning();
      if (!wallet) throw new Error('Wallet insert returned no row');
      return wallet;
    } catch (error) {
      if (
        isPostgresConstraintViolation(error, '23505', 'wallets_user_id_key')
      ) {
        throw new UserWalletExists({ cause: error });
      }
      if (
        isPostgresConstraintViolation(
          error,
          '23514',
          'ck_wallet_version_positive',
        )
      ) {
        throw new InvalidWalletVersion();
      }
      throw error;
    }
  }

  async findUserWallet(
    tx: DatabaseTransaction,
    userId: string,
  ): Promise<WalletSnapshot | null> {
    const [wallet] = await tx
      .select()
      .from(this.walletsTable)
      .where(eq(this.walletsTable.userId, userId))
      .limit(1);
    return wallet ?? null;
  }

  async findById(
    tx: DatabaseTransaction,
    walletId: string,
  ): Promise<WalletSnapshot | null> {
    const [wallet] = await tx
      .select()
      .from(this.walletsTable)
      .where(eq(this.walletsTable.id, walletId))
      .limit(1);
    return wallet ?? null;
  }

  async updateBalanceIfVersion(
    tx: DatabaseTransaction,
    data: {
      walletId: string;
      expectedVersion: number;
      newBalance: bigint;
      newVersion: number;
    },
  ): Promise<WalletSnapshot> {
    if (
      !Number.isSafeInteger(data.expectedVersion) ||
      !Number.isSafeInteger(data.newVersion) ||
      data.expectedVersion < 1 ||
      data.newVersion <= data.expectedVersion
    ) {
      throw new WalletConcurrencyConflict();
    }

    try {
      const [wallet] = await tx
        .update(this.walletsTable)
        .set({
          balanceCents: data.newBalance,
          version: data.newVersion,
        })
        .where(
          and(
            eq(this.walletsTable.id, data.walletId),
            eq(this.walletsTable.version, data.expectedVersion),
          ),
        )
        .returning();
      if (!wallet) throw new WalletConcurrencyConflict();
      return wallet;
    } catch (error) {
      if (
        isPostgresConstraintViolation(error, '23514', 'ck_positive_balance')
      ) {
        throw new WalletBalanceNegative({ cause: error });
      }
      if (
        isPostgresConstraintViolation(
          error,
          '23514',
          'ck_wallet_version_positive',
        )
      ) {
        throw new InvalidWalletVersion();
      }
      throw error;
    }
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { UNIT_OF_WORK, type UnitOfWork } from '../database/unit-of-work.js';
import * as schema from '../database/drizzle.schema.js';
import { Wallet, type WalletSnapshot } from '../wallet/wallet.entity.js';
import { WalletConcurrencyConflict } from '../wallet/wallet.errors.js';
import { toWalletEventRecords } from '../wallet/wallet.events.js';
import { WalletRepository } from '../wallet/wallet.repository.js';
import { EventsService } from '../events/events.service.js';
import { TransferNotFound, TransferInvalid, SelfTransfer, BalanceOverflow } from './transfer.errors.js';

const MAX_BALANCE = 9223372036854775807n;

@Injectable()
export class TransfersService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly wallets: WalletRepository,
    private readonly events: EventsService,
  ) {}

  create(senderUserId: string, recipientUserId: string, amountText: string) {
    if (!/^[0-9]+$/.test(amountText)) throw new TransferInvalid();
    const amount = BigInt(amountText);
    if (amount <= 0n || amount > MAX_BALANCE) throw new TransferInvalid();
    return this.uow.execute(async (tx) => {
      const [recipient] = await tx.select({ id: schema.usersTable.id }).from(schema.usersTable)
        .where(and(eq(schema.usersTable.id, recipientUserId), isNull(schema.usersTable.deletedAt))).limit(1);
      if (!recipient) throw new TransferNotFound('Recipient not found.');
      const senderSnapshot = await this.wallets.findUserWallet(tx, senderUserId);
      const recipientSnapshot = await this.wallets.findUserWallet(tx, recipientUserId);
      if (!senderSnapshot || !recipientSnapshot) throw new TransferNotFound('Wallet not found.');
      if (senderSnapshot.id === recipientSnapshot.id) throw new SelfTransfer();

      const ids = [senderSnapshot.id, recipientSnapshot.id].sort();
      const locked: WalletSnapshot[] = [];
      for (const id of ids) {
        const result = await tx.execute(sql`SELECT id, user_id as "userId", balance_cents as "balanceCents", version FROM wallets WHERE id = ${id}::uuid FOR UPDATE`);
        const row = (Array.isArray(result) ? result[0]?.rows[0] : result.rows[0]) as WalletSnapshot | undefined;
        if (!row) throw new TransferNotFound('Wallet not found.');
        locked.push({ ...row, balanceCents: BigInt(row.balanceCents) });
      }
      const byId = new Map(locked.map((wallet) => [wallet.id, wallet]));
      const fromSnapshot = byId.get(senderSnapshot.id)!;
      const toSnapshot = byId.get(recipientSnapshot.id)!;
      if (toSnapshot.balanceCents > MAX_BALANCE - amount) throw new BalanceOverflow();
      const sender = Wallet.fromSnapshot(fromSnapshot);
      const receiver = Wallet.fromSnapshot(toSnapshot);
      sender.debit(amount);
      receiver.credit(amount);
      if (sender.version > 2147483647 || receiver.version > 2147483647) throw new WalletConcurrencyConflict();
      const [transfer] = await tx.insert(schema.tranfersTable).values({
        senderWallet: sender.id, receiverWallet: receiver.id, amountCents: amount,
      }).returning();
      if (!transfer) throw new Error('Transfer insert returned no row');
      await this.wallets.updateBalanceIfVersion(tx, { walletId: sender.id, expectedVersion: fromSnapshot.version, newBalance: sender.balanceCents, newVersion: sender.version });
      await this.wallets.updateBalanceIfVersion(tx, { walletId: receiver.id, expectedVersion: toSnapshot.version, newBalance: receiver.balanceCents, newVersion: receiver.version });
      await this.events.append(tx, { aggregateType: 'WALLET', aggregateId: sender.id, expectedVersion: fromSnapshot.version, events: toWalletEventRecords(sender.id, sender.pendingEvents, transfer.id) });
      await this.events.append(tx, { aggregateType: 'WALLET', aggregateId: receiver.id, expectedVersion: toSnapshot.version, events: toWalletEventRecords(receiver.id, receiver.pendingEvents, transfer.id) });
      return { id: transfer.id, senderWallet: sender.id, receiverWallet: receiver.id, amountCents: amount.toString(), status: transfer.status, createdAt: transfer.createdAt };
    });
  }
}

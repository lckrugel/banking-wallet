import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { UNIT_OF_WORK, type UnitOfWork } from '../database/unit-of-work.js';
import * as schema from '../database/drizzle.schema.js';
import { Wallet, type WalletSnapshot } from '../wallet/wallet.entity.js';
import { WalletConcurrencyConflict } from '../wallet/wallet.errors.js';
import { toWalletEventRecords } from '../wallet/wallet.events.js';
import { WalletRepository } from '../wallet/wallet.repository.js';
import { EventsService } from '../events/events.service.js';
import { TransferNotFound, TransferInvalid, SelfTransfer, BalanceOverflow, IdempotencyKeyReused, TransferNotReversible } from './transfer.errors.js';
import { IdempotencyRepository } from './idempotency.repository.js';
import { TransfersRepository } from './transfers.repository.js';

const MAX_BALANCE = 9223372036854775807n;

@Injectable()
export class TransfersService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly wallets: WalletRepository,
    private readonly events: EventsService,
    private readonly idempotency: IdempotencyRepository,
    private readonly transfers: TransfersRepository,
  ) {}

  create(senderUserId: string, recipientUserId: string, amountText: string, key: string) {
    if (!/^[0-9]+$/.test(amountText)) throw new TransferInvalid();
    const amount = BigInt(amountText);
    if (amount <= 0n || amount > MAX_BALANCE) throw new TransferInvalid();
    const normalizedRecipient = recipientUserId.toLowerCase();
    const requestHash = createTransferFingerprint(normalizedRecipient, amount);
    return this.uow.execute(async (tx) => {
      const reservation = await this.idempotency.reserve(tx, senderUserId, key, requestHash);
      if (!reservation) {
        const prior = await this.idempotency.find(tx, senderUserId, key);
        if (!prior) throw new Error('Idempotency reservation disappeared');
        if (prior.requestHash !== requestHash) throw new IdempotencyKeyReused();
        const original = await this.transfers.findByIdempotencyKey(tx, prior.id);
        if (!original) throw new Error('Idempotency key exists without its transfer');
        return toTransferResponse(original);
      }
      const [recipient] = await tx.select({ id: schema.usersTable.id }).from(schema.usersTable)
        .where(and(eq(schema.usersTable.id, normalizedRecipient), isNull(schema.usersTable.deletedAt))).limit(1);
      if (!recipient) throw new TransferNotFound('Recipient not found.');
      const senderSnapshot = await this.wallets.findUserWallet(tx, senderUserId);
      const recipientSnapshot = await this.wallets.findUserWallet(tx, normalizedRecipient);
      if (!senderSnapshot || !recipientSnapshot) throw new TransferNotFound('Wallet not found.');
      if (senderSnapshot.id === recipientSnapshot.id) throw new SelfTransfer();

      const ids = [senderSnapshot.id, recipientSnapshot.id].sort();
      const locked: WalletSnapshot[] = [];
      for (const id of ids) {
        const row = await this.wallets.lockById(tx, id);
        if (!row) throw new TransferNotFound('Wallet not found.');
        locked.push(row);
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
      const transfer = await this.transfers.insert(tx, {
        senderWallet: sender.id, receiverWallet: receiver.id, amountCents: amount,
        idempotencyKeyId: reservation.id,
      });
      await this.wallets.updateBalanceIfVersion(tx, { walletId: sender.id, expectedVersion: fromSnapshot.version, newBalance: sender.balanceCents, newVersion: sender.version });
      await this.wallets.updateBalanceIfVersion(tx, { walletId: receiver.id, expectedVersion: toSnapshot.version, newBalance: receiver.balanceCents, newVersion: receiver.version });
      await this.events.append(tx, { aggregateType: 'WALLET', aggregateId: sender.id, expectedVersion: fromSnapshot.version, events: toWalletEventRecords(sender.id, sender.pendingEvents, transfer.id) });
      await this.events.append(tx, { aggregateType: 'WALLET', aggregateId: receiver.id, expectedVersion: toSnapshot.version, events: toWalletEventRecords(receiver.id, receiver.pendingEvents, transfer.id) });
      return toTransferResponse(transfer);
    });
  }

  reverse(senderUserId: string, transferId: string, key: string) {
    const requestHash = createHash('sha256').update(JSON.stringify({ command: 'transfer.reverse.v1', transferId: transferId.toLowerCase() })).digest('hex');
    return this.uow.execute(async (tx) => {
      const reservation = await this.idempotency.reserve(tx, senderUserId, key.toLowerCase(), requestHash);
      if (!reservation) {
        const prior = await this.idempotency.find(tx, senderUserId, key.toLowerCase());
        if (!prior) throw new Error('Idempotency reservation disappeared');
        if (prior.requestHash !== requestHash) throw new IdempotencyKeyReused();
        const existing = await this.transfers.findByIdempotencyKey(tx, prior.id);
        if (!existing) throw new Error('Idempotency key exists without its transfer');
        return toTransferResponse(existing);
      }
      const original = await this.transfers.lockById(tx, transferId);
      if (!original) throw new TransferNotFound('Transfer not found.');
      const sender = await this.wallets.findById(tx, original.senderWallet);
      if (!sender || sender.userId !== senderUserId) throw new TransferNotFound('Transfer not found.');
      if (original.reversalOf || original.status !== 'COMPLETED' || await this.transfers.findReversal(tx, original.id)) throw new TransferNotReversible();
      const ids = [original.senderWallet, original.receiverWallet].sort();
      const locked: WalletSnapshot[] = [];
      for (const id of ids) {
        const row = await this.wallets.lockById(tx, id);
        if (!row) throw new TransferNotFound('Transfer not found.');
        locked.push(row);
      }
      const byId = new Map(locked.map((wallet) => [wallet.id, wallet]));
      const fromSnapshot = byId.get(original.receiverWallet)!;
      const toSnapshot = byId.get(original.senderWallet)!;
      if (toSnapshot.balanceCents > MAX_BALANCE - original.amountCents) throw new BalanceOverflow();
      const debit = Wallet.fromSnapshot(fromSnapshot);
      const credit = Wallet.fromSnapshot(toSnapshot);
      debit.debit(original.amountCents);
      credit.credit(original.amountCents);
      if (debit.version > 2147483647 || credit.version > 2147483647) throw new WalletConcurrencyConflict();
      const reversal = await this.transfers.insert(tx, { senderWallet: debit.id, receiverWallet: credit.id, amountCents: original.amountCents, idempotencyKeyId: reservation.id, reversalOf: original.id });
      await this.wallets.updateBalanceIfVersion(tx, { walletId: debit.id, expectedVersion: fromSnapshot.version, newBalance: debit.balanceCents, newVersion: debit.version });
      await this.wallets.updateBalanceIfVersion(tx, { walletId: credit.id, expectedVersion: toSnapshot.version, newBalance: credit.balanceCents, newVersion: credit.version });
      await this.events.append(tx, { aggregateType: 'WALLET', aggregateId: debit.id, expectedVersion: fromSnapshot.version, events: toWalletEventRecords(debit.id, debit.pendingEvents, reversal.id) });
      await this.events.append(tx, { aggregateType: 'WALLET', aggregateId: credit.id, expectedVersion: toSnapshot.version, events: toWalletEventRecords(credit.id, credit.pendingEvents, reversal.id) });
      await this.transfers.markReversed(tx, original.id);
      return { ...toTransferResponse(reversal), reversalOf: original.id };
    });
  }
}

export function createTransferFingerprint(recipientUserId: string, amountCents: bigint): string {
  return createHash('sha256').update(JSON.stringify({
    command: 'transfer.create.v1',
    recipientUserId: recipientUserId.toLowerCase(),
    amountCents: amountCents.toString(),
  })).digest('hex');
}

function toTransferResponse(transfer: typeof schema.tranfersTable.$inferSelect) {
  return {
    id: transfer.id,
    senderWallet: transfer.senderWallet,
    receiverWallet: transfer.receiverWallet,
    amountCents: transfer.amountCents.toString(),
    // The create response describes the successful creation, not later reversals.
    status: 'COMPLETED' as const,
    createdAt: transfer.createdAt,
    ...(transfer.reversalOf ? { reversalOf: transfer.reversalOf } : {}),
  };
}

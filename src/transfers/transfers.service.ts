import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { UNIT_OF_WORK, type UnitOfWork } from '../database/unit-of-work.js';
import type { DatabaseTransaction } from '../database/database.types.js';
import type { Transfer } from '../database/drizzle.schema.js';
import { UsersRepository } from '../users/users.repository.js';
import { Wallet, type WalletSnapshot } from '../wallet/wallet.entity.js';
import { WalletConcurrencyConflict } from '../wallet/wallet.errors.js';
import { WalletRepository } from '../wallet/wallet.repository.js';
import { WalletService } from '../wallet/wallet.service.js';
import {
  TransferNotFound,
  TransferInvalid,
  SelfTransfer,
  BalanceOverflow,
  IdempotencyKeyReused,
  TransferNotReversible,
} from './transfer.errors.js';
import { IdempotencyRepository } from './idempotency.repository.js';
import { TransfersRepository } from './transfers.repository.js';

const MAX_BALANCE = 9223372036854775807n;
const MAX_VERSION = 2147483647;

type IdempotencyResult =
  { kind: 'reserved'; id: string } | { kind: 'replay'; transfer: Transfer };

@Injectable()
export class TransfersService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly wallets: WalletRepository,
    private readonly walletService: WalletService,
    private readonly idempotency: IdempotencyRepository,
    private readonly transfers: TransfersRepository,
    private readonly users: UsersRepository,
  ) {}

  create(
    senderUserId: string,
    recipientUserId: string,
    amountText: string,
    key: string,
  ) {
    if (!/^[0-9]+$/.test(amountText)) throw new TransferInvalid();
    const amount = BigInt(amountText);
    if (amount <= 0n || amount > MAX_BALANCE) throw new TransferInvalid();
    const normalizedRecipient = recipientUserId.toLowerCase();
    const requestHash = createTransferFingerprint(normalizedRecipient, amount);
    return this.uow.execute(async (tx) => {
      const reservation = await this.resolveIdempotency(
        tx,
        senderUserId,
        key,
        requestHash,
      );
      if (reservation.kind === 'replay') {
        return toTransferResponse(reservation.transfer);
      }
      if (!(await this.users.existsActiveById(tx, normalizedRecipient))) {
        throw new TransferNotFound('Recipient not found.');
      }
      const senderSnapshot = await this.wallets.findUserWallet(
        tx,
        senderUserId,
      );
      const recipientSnapshot = await this.wallets.findUserWallet(
        tx,
        normalizedRecipient,
      );
      if (!senderSnapshot || !recipientSnapshot)
        throw new TransferNotFound('Wallet not found.');
      if (senderSnapshot.id === recipientSnapshot.id) throw new SelfTransfer();

      const transfer = await this.moveFunds(tx, {
        senderWallet: senderSnapshot.id,
        receiverWallet: recipientSnapshot.id,
        amountCents: amount,
        idempotencyKeyId: reservation.id,
      });
      return toTransferResponse(transfer);
    });
  }

  reverse(senderUserId: string, transferId: string, key: string) {
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          command: 'transfer.reverse.v1',
          transferId: transferId.toLowerCase(),
        }),
      )
      .digest('hex');
    return this.uow.execute(async (tx) => {
      // Resolve retries before checking mutable state: the original may already be reversed.
      const reservation = await this.resolveIdempotency(
        tx,
        senderUserId,
        key,
        requestHash,
      );
      if (reservation.kind === 'replay') {
        return toTransferResponse(reservation.transfer);
      }
      const original = await this.transfers.lockById(tx, transferId);
      if (!original) throw new TransferNotFound('Transfer not found.');
      const sender = await this.wallets.findById(tx, original.senderWallet);
      if (!sender || sender.userId !== senderUserId)
        throw new TransferNotFound('Transfer not found.');
      if (
        original.reversalOf ||
        original.status !== 'COMPLETED' ||
        (await this.transfers.findReversal(tx, original.id))
      )
        throw new TransferNotReversible();
      const reversal = await this.moveFunds(tx, {
        senderWallet: original.receiverWallet,
        receiverWallet: original.senderWallet,
        amountCents: original.amountCents,
        idempotencyKeyId: reservation.id,
        reversalOf: original.id,
      });
      await this.transfers.markReversed(tx, original.id);
      return toTransferResponse(reversal);
    });
  }

  private async resolveIdempotency(
    tx: DatabaseTransaction,
    userId: string,
    key: string,
    requestHash: string,
  ): Promise<IdempotencyResult> {
    const normalizedKey = key.toLowerCase();
    const reservation = await this.idempotency.reserve(
      tx,
      userId,
      normalizedKey,
      requestHash,
    );
    if (reservation) return { kind: 'reserved', id: reservation.id };

    const prior = await this.idempotency.find(tx, userId, normalizedKey);
    if (!prior) throw new Error('Idempotency reservation disappeared');
    if (prior.requestHash !== requestHash) throw new IdempotencyKeyReused();
    const transfer = await this.transfers.findByIdempotencyKey(tx, prior.id);
    if (!transfer)
      throw new Error('Idempotency key exists without its transfer');
    return { kind: 'replay', transfer };
  }

  private async moveFunds(
    tx: DatabaseTransaction,
    movement: {
      senderWallet: string;
      receiverWallet: string;
      amountCents: bigint;
      idempotencyKeyId: string;
      reversalOf?: string;
    },
  ): Promise<Transfer> {
    const snapshots = new Map<string, WalletSnapshot>();
    // All movements acquire wallet locks sequentially in the same global order.
    for (const id of [movement.senderWallet, movement.receiverWallet].sort()) {
      const snapshot = await this.wallets.lockById(tx, id);
      if (!snapshot) throw new TransferNotFound('Wallet not found.');
      snapshots.set(id, snapshot);
    }
    const fromSnapshot = snapshots.get(movement.senderWallet)!;
    const toSnapshot = snapshots.get(movement.receiverWallet)!;
    if (toSnapshot.balanceCents > MAX_BALANCE - movement.amountCents) {
      throw new BalanceOverflow();
    }
    const sender = Wallet.fromSnapshot(fromSnapshot);
    const receiver = Wallet.fromSnapshot(toSnapshot);
    sender.debit(movement.amountCents);
    receiver.credit(movement.amountCents);
    if (sender.version > MAX_VERSION || receiver.version > MAX_VERSION) {
      throw new WalletConcurrencyConflict();
    }

    const transfer = await this.transfers.insert(tx, movement);
    await this.walletService.persistChanges(
      tx,
      fromSnapshot.version,
      sender,
      transfer.id,
    );
    await this.walletService.persistChanges(
      tx,
      toSnapshot.version,
      receiver,
      transfer.id,
    );
    return transfer;
  }
}

export function createTransferFingerprint(
  recipientUserId: string,
  amountCents: bigint,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        command: 'transfer.create.v1',
        recipientUserId: recipientUserId.toLowerCase(),
        amountCents: amountCents.toString(),
      }),
    )
    .digest('hex');
}

function toTransferResponse(transfer: Transfer) {
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

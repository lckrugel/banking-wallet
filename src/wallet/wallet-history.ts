import { BadRequestException, Injectable, Inject } from '@nestjs/common';
import { WalletRepository } from './wallet.repository.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../database/unit-of-work.js';
import { WalletNotFound } from './wallet.errors.js';

type Cursor = { createdAt: string; id: string };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function decodeCursor(value: string | undefined): Cursor | undefined {
  if (value === undefined) return undefined;
  try {
    const decoded = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { createdAt?: unknown; id?: unknown };
    if (
      typeof decoded.createdAt !== 'string' ||
      typeof decoded.id !== 'string' ||
      !UUID.test(decoded.id)
    )
      throw new Error();
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(decoded.createdAt)
    )
      throw new Error();
    const millisecondDate = new Date(`${decoded.createdAt.slice(0, 23)}Z`);
    if (
      !Number.isFinite(millisecondDate.getTime()) ||
      `${millisecondDate.toISOString().slice(0, 23)}Z` !==
        `${decoded.createdAt.slice(0, 23)}Z`
    )
      throw new Error();
    return { createdAt: decoded.createdAt, id: decoded.id };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}

@Injectable()
export class WalletHistoryService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly wallets: WalletRepository,
  ) {}

  async history(userId: string, rawLimit?: string, rawCursor?: string) {
    let limit = 20;
    if (rawLimit !== undefined) {
      if (!/^[0-9]+$/.test(rawLimit))
        throw new BadRequestException('Invalid limit');
      limit = Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new BadRequestException('Invalid limit');
    }
    const cursor = decodeCursor(rawCursor);
    return this.uow.execute(async (tx) => {
      const wallet = await this.wallets.findUserWallet(tx, userId);
      if (!wallet) throw new WalletNotFound();
      const rows = await this.wallets.findHistoryPage(
        tx,
        wallet.id,
        limit + 1,
        cursor,
      );
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      return {
        items: page.map((row) => ({
          operationId: row.id,
          type: row.reversalOf ? 'REVERSAL' : 'TRANSFER',
          direction: row.senderWallet === wallet.id ? 'OUTGOING' : 'INCOMING',
          amountCents: row.amountCents.toString(),
          status: row.status,
          senderWalletId: row.senderWallet,
          receiverWalletId: row.receiverWallet,
          reversalOf: row.reversalOf,
          createdAt: row.createdAtExact,
        })),
        nextCursor:
          hasMore && page.length
            ? Buffer.from(
                JSON.stringify({
                  createdAt: page.at(-1)!.createdAtExact,
                  id: page.at(-1)!.id,
                }),
              ).toString('base64url')
            : null,
      };
    });
  }
}

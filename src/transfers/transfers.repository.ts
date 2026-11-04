import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as schema from '../database/drizzle.schema.js';
import type { DatabaseTransaction } from '../database/database.types.js';

@Injectable()
export class TransfersRepository {
  async lockById(tx: DatabaseTransaction, id: string) {
    const [transfer] = await tx
      .select()
      .from(schema.tranfersTable)
      .where(eq(schema.tranfersTable.id, id))
      .for('update');
    return transfer ?? null;
  }

  async findReversal(tx: DatabaseTransaction, id: string) {
    const [row] = await tx
      .select()
      .from(schema.tranfersTable)
      .where(eq(schema.tranfersTable.reversalOf, id))
      .limit(1);
    return row ?? null;
  }

  async markReversed(tx: DatabaseTransaction, id: string) {
    await tx
      .update(schema.tranfersTable)
      .set({ status: 'REVERSED' })
      .where(eq(schema.tranfersTable.id, id));
  }
  async insert(
    tx: DatabaseTransaction,
    data: {
      senderWallet: string;
      receiverWallet: string;
      amountCents: bigint;
      idempotencyKeyId: string;
      reversalOf?: string;
    },
  ) {
    const [row] = await tx
      .insert(schema.tranfersTable)
      .values(data)
      .returning();
    if (!row) throw new Error('Transfer insert returned no row');
    return row;
  }

  async findByIdempotencyKey(
    tx: DatabaseTransaction,
    idempotencyKeyId: string,
  ) {
    const [row] = await tx
      .select()
      .from(schema.tranfersTable)
      .where(eq(schema.tranfersTable.idempotencyKeyId, idempotencyKeyId))
      .limit(1);
    return row ?? null;
  }
}

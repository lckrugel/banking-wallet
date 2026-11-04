import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as schema from '../database/drizzle.schema.js';
import type { DatabaseTransaction } from '../database/database.types.js';

@Injectable()
export class TransfersRepository {
  async insert(tx: DatabaseTransaction, data: { senderWallet: string; receiverWallet: string; amountCents: bigint; idempotencyKeyId: string }) {
    const [row] = await tx.insert(schema.tranfersTable).values(data).returning();
    if (!row) throw new Error('Transfer insert returned no row');
    return row;
  }

  async findByIdempotencyKey(tx: DatabaseTransaction, idempotencyKeyId: string) {
    const [row] = await tx.select().from(schema.tranfersTable)
      .where(eq(schema.tranfersTable.idempotencyKeyId, idempotencyKeyId)).limit(1);
    return row ?? null;
  }
}

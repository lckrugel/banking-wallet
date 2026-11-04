import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../database/drizzle.schema.js';
import type { DatabaseTransaction } from '../database/database.types.js';

@Injectable()
export class TransfersRepository {
  async lockById(tx: DatabaseTransaction, id: string) {
    const result = await tx.execute(sql`SELECT * FROM transfers WHERE id = ${id}::uuid FOR UPDATE`);
    const row = (Array.isArray(result) ? result[0]?.rows[0] : result.rows[0]) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id), senderWallet: String(row.sender_wallet), receiverWallet: String(row.receiver_wallet),
      amountCents: BigInt(String(row.amount_cents)), status: String(row.status) as 'COMPLETED' | 'REVERSED',
      reversalOf: row.reversal_of ? String(row.reversal_of as string) : null,
      idempotencyKeyId: row.idempotency_key_id ? String(row.idempotency_key_id as string) : null,
      createdAt: row.created_at as Date,
    };
  }

  async findReversal(tx: DatabaseTransaction, id: string) {
    const [row] = await tx.select().from(schema.tranfersTable).where(eq(schema.tranfersTable.reversalOf, id)).limit(1);
    return row ?? null;
  }

  async markReversed(tx: DatabaseTransaction, id: string) {
    await tx.update(schema.tranfersTable).set({ status: 'REVERSED' }).where(eq(schema.tranfersTable.id, id));
  }
  async insert(tx: DatabaseTransaction, data: { senderWallet: string; receiverWallet: string; amountCents: bigint; idempotencyKeyId: string; reversalOf?: string }) {
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

import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import * as schema from '../database/drizzle.schema.js';
import type { DatabaseTransaction } from '../database/database.types.js';

@Injectable()
export class IdempotencyRepository {
  async reserve(tx: DatabaseTransaction, userId: string, key: string, requestHash: string) {
    const [row] = await tx.insert(schema.idempotencyKeysTable)
      .values({ userId, key, requestHash })
      .onConflictDoNothing({ target: [schema.idempotencyKeysTable.userId, schema.idempotencyKeysTable.key] })
      .returning();
    return row ?? null;
  }

  async find(tx: DatabaseTransaction, userId: string, key: string) {
    const [row] = await tx.select().from(schema.idempotencyKeysTable)
      .where(and(eq(schema.idempotencyKeysTable.userId, userId), eq(schema.idempotencyKeysTable.key, key))).limit(1);
    return row ?? null;
  }
}

import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import * as schema from '../database/drizzle.schema.js';
import type { DatabaseTransaction } from '../database/database.types.js';

@Injectable()
export class AuthRepository {
  async createSession(
    tx: DatabaseTransaction,
    userId: string,
    expiresAt: Date,
  ) {
    const [session] = await tx
      .insert(schema.sessionsTable)
      .values({ userId, expiresAt })
      .returning({ id: schema.sessionsTable.id });
    return session;
  }

  async findActiveSession(
    tx: DatabaseTransaction,
    sessionId: string,
    userId: string,
    now = new Date(),
  ) {
    const [session] = await tx
      .select({
        id: schema.sessionsTable.id,
        userId: schema.usersTable.id,
        email: schema.usersTable.email,
        name: schema.usersTable.name,
      })
      .from(schema.sessionsTable)
      .innerJoin(
        schema.usersTable,
        eq(schema.sessionsTable.userId, schema.usersTable.id),
      )
      .where(
        and(
          eq(schema.sessionsTable.id, sessionId),
          eq(schema.sessionsTable.userId, userId),
          isNull(schema.sessionsTable.revokedAt),
          gt(schema.sessionsTable.expiresAt, now),
          isNull(schema.usersTable.deletedAt),
        ),
      )
      .limit(1);
    return session;
  }

  async revokeSession(
    tx: DatabaseTransaction,
    sessionId: string,
    userId: string,
    revokedAt = new Date(),
  ) {
    const [session] = await tx
      .update(schema.sessionsTable)
      .set({ revokedAt })
      .where(
        and(
          eq(schema.sessionsTable.id, sessionId),
          eq(schema.sessionsTable.userId, userId),
          isNull(schema.sessionsTable.revokedAt),
        ),
      )
      .returning({ id: schema.sessionsTable.id });
    return Boolean(session);
  }
}

import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../database/drizzle.schema.js';

type Database = NodePgDatabase;

@Injectable()
export class AuthRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async createUser(input: { email: string; password: string; name: string }) {
    try {
      const [user] = await this.db
        .insert(schema.usersTable)
        .values(input)
        .returning({
          id: schema.usersTable.id,
          email: schema.usersTable.email,
          name: schema.usersTable.name,
        });
      return user;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException({
          statusCode: 409,
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email already exists',
        });
      }
      throw error;
    }
  }

  async findUserByEmail(email: string) {
    const [user] = await this.db
      .select()
      .from(schema.usersTable)
      .where(
        and(
          eq(schema.usersTable.email, email),
          isNull(schema.usersTable.deletedAt),
        ),
      )
      .limit(1);
    return user;
  }

  async createSession(userId: string, expiresAt: Date) {
    const [session] = await this.db
      .insert(schema.sessionsTable)
      .values({ userId, expiresAt })
      .returning({ id: schema.sessionsTable.id });
    return session;
  }

  async findActiveSession(sessionId: string, userId: string, now = new Date()) {
    const [session] = await this.db
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
    sessionId: string,
    userId: string,
    revokedAt = new Date(),
  ) {
    const [session] = await this.db
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

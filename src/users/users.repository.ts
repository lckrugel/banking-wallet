import { ConflictException, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../database/drizzle.schema.js';
import type { DatabaseTransaction } from '../database/database.types.js';

@Injectable()
export class UsersRepository {
  async create(
    tx: DatabaseTransaction,
    input: { email: string; password: string; name: string },
  ) {
    try {
      const [user] = await tx
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

  async findByEmail(tx: DatabaseTransaction, email: string) {
    const [user] = await tx
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
}

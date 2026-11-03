import { InjectDrizzle } from '@nestjs/drizzle';
import { Injectable } from '@nestjs/common';
import type { Database, DatabaseTransaction } from './database.types.js';

export interface UnitOfWork {
  execute<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T>;
}

@Injectable()
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  execute<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }
}

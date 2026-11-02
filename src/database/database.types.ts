import type { EmptyRelations } from 'drizzle-orm';
import type {
  NodePgDatabase,
  NodePgTransaction,
} from 'drizzle-orm/node-postgres';

export type Database = NodePgDatabase;
export type DatabaseTransaction = NodePgTransaction<EmptyRelations>;

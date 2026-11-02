import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { pgTable } from 'drizzle-orm/pg-core';

export const usersTable = pgTable('users', (t) => ({
  id: t.uuid().defaultRandom().primaryKey(),
  email: t.varchar().unique().notNull(),
  password: t.varchar().notNull(),
  name: t.varchar().notNull(),
  deletedAt: t.timestamp('deleted_at'),
  createdAt: t.timestamp('created_at').defaultNow().notNull(),
  updatedAt: t
    .timestamp('updated_at')
    .$onUpdateFn(() => new Date())
    .notNull(),
}));

export type User = InferSelectModel<typeof usersTable>;
export type NewUser = InferInsertModel<typeof usersTable>;

export const sessionsTable = pgTable('sessions', (t) => ({
  id: t.uuid().defaultRandom().primaryKey(),
  userId: t
    .uuid()
    .references(() => usersTable.id)
    .notNull(),
  createdAt: t.timestamp('created_at').defaultNow().notNull(),
  expiresAt: t.timestamp('expires_at').notNull(),
  revokedAt: t.timestamp('revoked_at'),
}));

export type Session = InferSelectModel<typeof sessionsTable>;
export type NewSession = InferInsertModel<typeof sessionsTable>;

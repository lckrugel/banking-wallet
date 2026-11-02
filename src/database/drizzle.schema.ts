import { InferInsertModel, InferSelectModel, sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  check,
  index,
  pgEnum,
  pgTable,
  unique,
} from 'drizzle-orm/pg-core';

export const usersTable = pgTable('users', (t) => ({
  id: t.uuid().defaultRandom().primaryKey(),
  email: t.varchar().unique().notNull(),
  password: t.varchar().notNull(),
  name: t.varchar().notNull(),
  deletedAt: t.timestamp('deleted_at', { withTimezone: true }),
  createdAt: t
    .timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: t
    .timestamp('updated_at', { withTimezone: true })
    .$onUpdateFn(() => new Date())
    .notNull(),
}));

export type User = InferSelectModel<typeof usersTable>;
export type NewUser = InferInsertModel<typeof usersTable>;

export const sessionsTable = pgTable('sessions', (t) => ({
  id: t.uuid().defaultRandom().primaryKey(),
  userId: t
    .uuid('user_id')
    .references(() => usersTable.id)
    .notNull(),
  createdAt: t
    .timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: t.timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: t.timestamp('revoked_at', { withTimezone: true }),
}));

export type Session = InferSelectModel<typeof sessionsTable>;
export type NewSession = InferInsertModel<typeof sessionsTable>;

export const walletsTable = pgTable(
  'wallets',
  (t) => ({
    id: t.uuid().defaultRandom().primaryKey(),
    userId: t
      .uuid('user_id')
      .references(() => usersTable.id)
      .unique()
      .notNull(),
    balanceCents: t
      .bigint('balance_cents', { mode: 'bigint' })
      .notNull()
      .default(0n),
    version: t.integer().notNull(),
    createdAt: t
      .timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp('updated_at', { withTimezone: true })
      .$onUpdateFn(() => new Date())
      .notNull(),
  }),
  (t) => [check('ck_positive_balance', sql`${t.balanceCents} >= 0`)],
);

export type Wallet = InferSelectModel<typeof walletsTable>;
export type NewWallet = InferInsertModel<typeof walletsTable>;

export const idempotencyKeysTable = pgTable(
  'idempotency_keys',
  (t) => ({
    id: t.uuid().defaultRandom().primaryKey(),
    userId: t
      .uuid('user_id')
      .references(() => usersTable.id)
      .notNull(),
    key: t.uuid().notNull(),
    requestHash: t
      .varchar('request_hash', {
        length: 64,
      })
      .notNull(),
    createdAt: t
      .timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [unique('uq_user_idempotency').on(t.userId, t.key)],
);

export type IdempotencyKey = InferSelectModel<typeof idempotencyKeysTable>;
export type NewIdempotencyKey = InferInsertModel<typeof idempotencyKeysTable>;

export const transferStatusEnum = pgEnum('status', ['COMPLETED', 'REVERSED']);

export const tranfersTable = pgTable(
  'transfers',
  (t) => ({
    id: t.uuid().defaultRandom().primaryKey(),
    senderWallet: t
      .uuid('sender_wallet')
      .references(() => walletsTable.id)
      .notNull(),
    receiverWallet: t
      .uuid('receiver_wallet')
      .references(() => walletsTable.id)
      .notNull(),
    amountCents: t.bigint('amount_cents', { mode: 'bigint' }).notNull(),
    status: transferStatusEnum().default('COMPLETED').notNull(),
    reversalOf: t
      .uuid('reversal_of')
      .references((): AnyPgColumn => tranfersTable.id)
      .unique(),
    idempotencyKeyId: t
      .uuid('idempotency_key_id')
      .references(() => idempotencyKeysTable.id)
      .unique()
      .notNull(),
    createdAt: t
      .timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    index('idx_sender_wallet').on(t.senderWallet),
    index('idx_receiver_wallet').on(t.receiverWallet),
    check('ck_transfer_amount_positive', sql`${t.amountCents} > 0`),
    check(
      'ck_not_self_transfer',
      sql`${t.receiverWallet} <> ${t.senderWallet}`,
    ),
    check(
      'ck_transfer_not_self_reversal',
      sql`${t.reversalOf} IS NULL OR ${t.reversalOf} <> ${t.id}`,
    ),
  ],
);

export type Transfer = InferSelectModel<typeof tranfersTable>;
export type NewTransfer = InferInsertModel<typeof tranfersTable>;

export const aggregateTypeEnum = pgEnum('aggregate_type', ['WALLET']);

export const eventTypeEnum = pgEnum('event_type', [
  'WALLET_CREATED',
  'SEED_FUNDS',
  'FUNDS_CREDITED',
  'FUNDS_DEBITED',
]);

export const eventsTable = pgTable(
  'events',
  (t) => ({
    id: t.uuid().defaultRandom().primaryKey(),
    aggregateType: aggregateTypeEnum().notNull(),
    aggregateId: t.uuid('aggregate_id').notNull(),
    version: t.integer().notNull(),
    eventType: eventTypeEnum().notNull(),
    payload: t.jsonb().notNull(),
    operationId: t.uuid('operation_id'),
    createdAt: t
      .timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    unique('uq_events_aggregate_version').on(
      t.aggregateType,
      t.aggregateId,
      t.version,
    ),
    index('idx_aggregate').on(t.aggregateType, t.aggregateId),
  ],
);

export type Event = InferSelectModel<typeof eventsTable>;
export type NewEvent = InferInsertModel<typeof eventsTable>;

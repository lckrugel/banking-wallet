import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../src/database/database.types.js';
import * as schema from '../src/database/drizzle.schema.js';
import { DrizzleUnitOfWork } from '../src/database/unit-of-work.js';
import { UsersRepository } from '../src/users/users.repository.js';
import { EventsRepository } from '../src/events/events.repository.js';
import { EventsService } from '../src/events/events.service.js';
import {
  EventVersionConflict,
  InvalidEventSequence,
} from '../src/events/events.errors.js';
import { Wallet } from '../src/wallet/wallet.entity.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { WalletRepository } from '../src/wallet/wallet.repository.js';
import {
  InvalidWalletVersion,
  WalletBalanceNegative,
  WalletConcurrencyConflict,
  UserWalletExists,
} from '../src/wallet/wallet.errors.js';
import { WalletConsistencyVerifier } from '../src/wallet/wallet-consistency-verifier.js';
import { toWalletEventRecords } from '../src/wallet/wallet.events.js';
import { EmailAlreadyExists } from '../src/users/users.errors.js';

describe('wallet persistence (PostgreSQL)', () => {
  const pool = new Pool({
    host: process.env.TEST_PG_HOST ?? '127.0.0.1',
    port: Number(process.env.TEST_PG_PORT ?? 5433),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DB,
  });
  const db = drizzle({ client: pool });
  const unitOfWork = new DrizzleUnitOfWork(db as unknown as Database);
  const users = new UsersRepository();
  const walletRepository = new WalletRepository();
  const eventRepository = new EventsRepository();
  const events = new EventsService(eventRepository);
  const walletService = new WalletService(
    unitOfWork,
    walletRepository,
    eventRepository,
    events,
  );
  const verifier = new WalletConsistencyVerifier(
    unitOfWork,
    walletRepository,
    eventRepository,
  );
  const userIds: string[] = [];
  const walletIds: string[] = [];
  const idempotencyKeyIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.PG_USER || !process.env.PG_PASSWORD || !process.env.PG_DB) {
      throw new Error('Set PG_USER, PG_PASSWORD and PG_DB for integration tests');
    }
    await pool.query('SELECT 1');
  });

  afterEach(async () => {
    for (const walletId of walletIds) {
      await db
        .delete(schema.eventsTable)
        .where(eq(schema.eventsTable.aggregateId, walletId));
      await db
        .delete(schema.walletsTable)
        .where(eq(schema.walletsTable.id, walletId));
    }
    for (const keyId of idempotencyKeyIds) {
      await db
        .delete(schema.idempotencyKeysTable)
        .where(eq(schema.idempotencyKeysTable.id, keyId));
    }
    for (const userId of userIds) {
      await db.delete(schema.usersTable).where(eq(schema.usersTable.id, userId));
    }
    walletIds.length = 0;
    userIds.length = 0;
    idempotencyKeyIds.length = 0;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createUserAndWallet() {
    return unitOfWork.execute(async (tx) => {
      const user = await users.create(tx, {
        email: `${randomUUID()}@example.test`,
        password: 'test-hash',
        name: 'Integration Test',
      });
      userIds.push(user.id);
      const wallet = await walletService.createForUser(tx, user.id);
      walletIds.push(wallet.id);
      return { user, wallet };
    });
  }

  it('rolls back user, wallet projection and events when event persistence fails', async () => {
    const email = `${randomUUID()}@example.test`;
    let userId = '';
    let walletId = '';

    await expect(
      unitOfWork.execute(async (tx) => {
        const user = await users.create(tx, {
          email,
          password: 'test-hash',
          name: 'Rollback Test',
        });
        userId = user.id;
        userIds.push(userId);

        const wallet = await walletService.createForUser(tx, user.id);
        walletId = wallet.id;
        walletIds.push(walletId);

        // Re-inserting version 1 deliberately triggers the real unique constraint.
        await eventRepository.insert(
          tx,
          toWalletEventRecords(wallet.id, wallet.pendingEvents),
        );
      }),
    ).rejects.toBeInstanceOf(EventVersionConflict);

    const [persistedUser] = await db
      .select()
      .from(schema.usersTable)
      .where(eq(schema.usersTable.id, userId));
    const [persistedWallet] = await db
      .select()
      .from(schema.walletsTable)
      .where(eq(schema.walletsTable.id, walletId));
    const persistedEvents = await db
      .select()
      .from(schema.eventsTable)
      .where(eq(schema.eventsTable.aggregateId, walletId));

    expect(persistedUser).toBeUndefined();
    expect(persistedWallet).toBeUndefined();
    expect(persistedEvents).toHaveLength(0);
  });

  it('allows only one writer based on the same projection version', async () => {
    const { wallet } = await createUserAndWallet();
    const snapshot = await unitOfWork.execute((tx) =>
      walletRepository.findById(tx, wallet.id),
    );
    if (!snapshot) throw new Error('Test wallet was not persisted');

    const first = Wallet.fromSnapshot(snapshot);
    const second = Wallet.fromSnapshot(snapshot);
    first.credit(40n);
    second.credit(70n);

    const persist = (candidate: Wallet) =>
      unitOfWork.execute(async (tx) => {
        await walletRepository.updateBalanceIfVersion(tx, {
          walletId: candidate.id,
          expectedVersion: snapshot.version,
          newBalance: candidate.balanceCents,
          newVersion: candidate.version,
        });
        await events.append(tx, {
          aggregateType: 'WALLET',
          aggregateId: candidate.id,
          expectedVersion: snapshot.version,
          events: toWalletEventRecords(candidate.id, candidate.pendingEvents),
        });
      });

    const outcomes = await Promise.allSettled([persist(first), persist(second)]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.any(WalletConcurrencyConflict),
    });

    const [current] = await db
      .select()
      .from(schema.walletsTable)
      .where(eq(schema.walletsTable.id, wallet.id));
    const persistedEvents = await unitOfWork.execute((tx) =>
      eventRepository.findWalletEvents(tx, wallet.id),
    );
    expect(current.version).toBe(2);
    expect(current.balanceCents === 40n || current.balanceCents === 70n).toBe(true);
    expect(persistedEvents.map((event) => event.version)).toEqual([1, 2]);
  });

  it('maps the wallet balance check constraint to a domain error', async () => {
    const { wallet } = await createUserAndWallet();

    await expect(
      unitOfWork.execute((tx) =>
        walletRepository.updateBalanceIfVersion(tx, {
          walletId: wallet.id,
          expectedVersion: 1,
          newBalance: -1n,
          newVersion: 2,
        }),
      ),
    ).rejects.toBeInstanceOf(WalletBalanceNegative);
  });

  it('maps the one-wallet-per-user constraint to a domain error', async () => {
    const { user } = await createUserAndWallet();

    await expect(
      unitOfWork.execute((tx) => walletService.createForUser(tx, user.id)),
    ).rejects.toBeInstanceOf(UserWalletExists);
  });

  it('maps invalid persisted wallet and event versions to custom errors', async () => {
    const user = await unitOfWork.execute((tx) =>
      users.create(tx, {
        email: `${randomUUID()}@example.test`,
        password: 'test-hash',
        name: 'Invalid Version Test',
      }),
    );
    userIds.push(user.id);

    await expect(
      unitOfWork.execute((tx) =>
        walletRepository.insertProjection(tx, {
          id: randomUUID(),
          userId: user.id,
          balanceCents: 0n,
          version: 0,
        } as Wallet),
      ),
    ).rejects.toBeInstanceOf(InvalidWalletVersion);

    const { wallet } = await createUserAndWallet();
    await expect(
      unitOfWork.execute((tx) =>
        eventRepository.insert(tx, [
          {
            aggregateType: 'WALLET',
            aggregateId: wallet.id,
            version: 0,
            eventType: 'FUNDS_CREDITED',
            payload: { amountCents: '10' },
          },
        ]),
      ),
    ).rejects.toBeInstanceOf(InvalidEventSequence);
  });

  it('maps the email unique constraint to a domain error', async () => {
    const email = `${randomUUID()}@example.test`;
    await unitOfWork.execute((tx) =>
      users.create(tx, { email, password: 'test-hash', name: 'First' }),
    ).then((user) => userIds.push(user.id));

    await expect(
      unitOfWork.execute((tx) =>
        users.create(tx, { email, password: 'test-hash', name: 'Second' }),
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyExists);
  });

  it('enforces the transfer amount check in PostgreSQL', async () => {
    const sender = await createUserAndWallet();
    const receiver = await createUserAndWallet();
    const [idempotencyKey] = await db
      .insert(schema.idempotencyKeysTable)
      .values({
        userId: sender.user.id,
        key: randomUUID(),
        requestHash: 'a'.repeat(64),
      })
      .returning({ id: schema.idempotencyKeysTable.id });
    idempotencyKeyIds.push(idempotencyKey.id);

    await expect(
      db.insert(schema.tranfersTable).values({
        senderWallet: sender.wallet.id,
        receiverWallet: receiver.wallet.id,
        amountCents: 0n,
        idempotencyKeyId: idempotencyKey.id,
      }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        code: '23514',
        constraint: 'ck_transfer_amount_positive',
      }),
    });
  });

  it('detects projection drift by replaying persisted events', async () => {
    const { user, wallet } = await createUserAndWallet();
    const seeded = await walletService.seedUserWallet(
      user.id,
      125n,
      `integration-seed-${randomUUID()}`,
    );

    await expect(verifier.verify(wallet.id)).resolves.toMatchObject({
      consistent: true,
      version: seeded.version,
      balanceCents: '125',
    });

    await db
      .update(schema.walletsTable)
      .set({ balanceCents: 126n })
      .where(and(eq(schema.walletsTable.id, wallet.id), eq(schema.walletsTable.version, 2)));

    await expect(verifier.verify(wallet.id)).resolves.toMatchObject({
      consistent: false,
      reason: 'STATE_MISMATCH',
      projection: { balanceCents: '126', version: 2 },
      reconstructed: { balanceCents: '125', version: 2 },
    });
  });
});

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, inArray, or } from 'drizzle-orm';
import type { Database } from '../src/database/database.types.js';
import * as schema from '../src/database/drizzle.schema.js';
import { DrizzleUnitOfWork } from '../src/database/unit-of-work.js';
import { UsersRepository } from '../src/users/users.repository.js';
import { EventsRepository } from '../src/events/events.repository.js';
import { EventsService } from '../src/events/events.service.js';
import { WalletService } from '../src/wallet/wallet.service.js';
import { WalletRepository } from '../src/wallet/wallet.repository.js';
import { TransfersService } from '../src/transfers/transfers.service.js';
import { InsufficientFunds } from '../src/wallet/wallet.errors.js';
import { IdempotencyKeyReused } from '../src/transfers/transfer.errors.js';
import { IdempotencyRepository } from '../src/transfers/idempotency.repository.js';
import { TransfersRepository } from '../src/transfers/transfers.repository.js';

describe('transfers (PostgreSQL)', () => {
  const pool = new Pool({
    host: process.env.TEST_PG_HOST ?? '127.0.0.1',
    port: Number(process.env.TEST_PG_PORT ?? 5433),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DB,
  });
  const db = drizzle({ client: pool });
  const uow = new DrizzleUnitOfWork(db as unknown as Database);
  const users = new UsersRepository();
  const wallets = new WalletRepository();
  const eventRepository = new EventsRepository();
  const events = new EventsService(eventRepository);
  const walletService = new WalletService(uow, wallets, eventRepository, events);
  const idempotency = new IdempotencyRepository();
  const transferRepository = new TransfersRepository();
  const transfers = new TransfersService(uow, wallets, events, idempotency, transferRepository);
  const userIds: string[] = [];
  const walletIds: string[] = [];
  const transferIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.PG_USER || !process.env.PG_PASSWORD || !process.env.PG_DB)
      throw new Error('Set PG_USER, PG_PASSWORD and PG_DB for integration tests');
    await pool.query('SELECT 1');
  });

  afterEach(async () => {
    for (const walletId of walletIds) {
      await db.delete(schema.eventsTable).where(eq(schema.eventsTable.aggregateId, walletId));
    }
    if (walletIds.length) {
      await db.delete(schema.tranfersTable).where(or(
        inArray(schema.tranfersTable.senderWallet, walletIds),
        inArray(schema.tranfersTable.receiverWallet, walletIds),
      ));
      await db.delete(schema.walletsTable).where(inArray(schema.walletsTable.id, walletIds));
    }
    if (userIds.length) await db.delete(schema.idempotencyKeysTable).where(inArray(schema.idempotencyKeysTable.userId, userIds));
    if (userIds.length) await db.delete(schema.usersTable).where(inArray(schema.usersTable.id, userIds));
    transferIds.length = 0;
    walletIds.length = 0;
    userIds.length = 0;
  });

  afterAll(async () => pool.end());

  async function createWallet(balance = 0n) {
    const result = await uow.execute(async (tx) => {
      const user = await users.create(tx, {
        email: `${randomUUID()}@example.test`, password: 'test-hash', name: 'Transfer Integration',
      });
      userIds.push(user.id);
      const wallet = await walletService.createForUser(tx, user.id);
      walletIds.push(wallet.id);
      return { user, wallet };
    });
    if (balance) await walletService.seedUserWallet(result.user.id, balance, `test-${randomUUID()}`);
    return result;
  }

  it('persists transfer, both projections and two operation-linked events with coherent versions', async () => {
    const sender = await createWallet(500n);
    const receiver = await createWallet(25n);
    const transfer = await transfers.create(sender.user.id, receiver.user.id, '125', randomUUID());
    transferIds.push(transfer.id);

    const [from] = await db.select().from(schema.walletsTable).where(eq(schema.walletsTable.id, sender.wallet.id));
    const [to] = await db.select().from(schema.walletsTable).where(eq(schema.walletsTable.id, receiver.wallet.id));
    const [operation] = await db.select().from(schema.tranfersTable).where(eq(schema.tranfersTable.id, transfer.id));
    const operationEvents = await db.select().from(schema.eventsTable).where(eq(schema.eventsTable.operationId, transfer.id));

    expect(from).toMatchObject({ balanceCents: 375n, version: 3 });
    expect(to).toMatchObject({ balanceCents: 150n, version: 3 });
    expect(from.balanceCents + to.balanceCents).toBe(525n);
    expect(operation).toMatchObject({ senderWallet: sender.wallet.id, receiverWallet: receiver.wallet.id, amountCents: 125n });
    expect(operation?.idempotencyKeyId).toBeTruthy();
    expect(operationEvents).toHaveLength(2);
    expect(operationEvents.map((event) => event.eventType).sort((a, b) => a.localeCompare(b))).toEqual(['FUNDS_CREDITED', 'FUNDS_DEBITED']);
    expect(operationEvents.every((event) => event.operationId === transfer.id)).toBe(true);
    expect(operationEvents.map((event) => event.version).sort((a, b) => a - b)).toEqual([3, 3]);
  });

  it('rejects insufficient funds without persisting any part of the transfer', async () => {
    const sender = await createWallet(50n);
    const receiver = await createWallet(7n);
    await expect(transfers.create(sender.user.id, receiver.user.id, '51', randomUUID())).rejects.toBeInstanceOf(InsufficientFunds);
    const [from] = await db.select().from(schema.walletsTable).where(eq(schema.walletsTable.id, sender.wallet.id));
    const [to] = await db.select().from(schema.walletsTable).where(eq(schema.walletsTable.id, receiver.wallet.id));
    expect([from.balanceCents, from.version, to.balanceCents, to.version]).toEqual([50n, 2, 7n, 2]);
    expect(await db.select().from(schema.tranfersTable).where(eq(schema.tranfersTable.senderWallet, sender.wallet.id))).toHaveLength(0);
    const walletEvents = await db.select().from(schema.eventsTable).where(or(
      eq(schema.eventsTable.aggregateId, sender.wallet.id), eq(schema.eventsTable.aggregateId, receiver.wallet.id),
    ));
    expect(walletEvents).toHaveLength(4);
  });

  it('rolls back the operation, projections and first event when a later event append fails', async () => {
    const sender = await createWallet(200n);
    const receiver = await createWallet(10n);
    let appendCount = 0;
    const failOnSecondAppend = {
      append: (...args: Parameters<EventsService['append']>) => {
        appendCount += 1;
        if (appendCount === 2) throw new Error('forced event append failure');
        return events.append(...args);
      },
    } as EventsService;
    const failingTransfers = new TransfersService(uow, wallets, failOnSecondAppend, idempotency, transferRepository);
    const key = randomUUID();
    await expect(failingTransfers.create(sender.user.id, receiver.user.id, '40', key)).rejects.toThrow('forced event append failure');
    const retried = await transfers.create(sender.user.id, receiver.user.id, '40', key);
    transferIds.push(retried.id);
    const [from] = await db.select().from(schema.walletsTable).where(eq(schema.walletsTable.id, sender.wallet.id));
    const [to] = await db.select().from(schema.walletsTable).where(eq(schema.walletsTable.id, receiver.wallet.id));
    expect([from.balanceCents, from.version, to.balanceCents, to.version]).toEqual([160n, 3, 50n, 3]);
    expect(await db.select().from(schema.tranfersTable).where(eq(schema.tranfersTable.senderWallet, sender.wallet.id))).toHaveLength(1);
    const bothEvents = await db.select().from(schema.eventsTable).where(or(
      eq(schema.eventsTable.aggregateId, sender.wallet.id), eq(schema.eventsTable.aggregateId, receiver.wallet.id),
    ));
    expect(bothEvents).toHaveLength(6);
  });

  it('serializes concurrent spending so only one transfer can spend the available funds', async () => {
    const sender = await createWallet(100n);
    const receiverA = await createWallet();
    const receiverB = await createWallet();
    const outcomes = await Promise.allSettled([
      transfers.create(sender.user.id, receiverA.user.id, '80', randomUUID()),
      transfers.create(sender.user.id, receiverB.user.id, '80', randomUUID()),
    ]);
    const successful = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const failed = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(successful).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientFunds);
    const [from] = await db.select().from(schema.walletsTable).where(eq(schema.walletsTable.id, sender.wallet.id));
    expect(from.balanceCents).toBe(20n);
    expect(from.version).toBe(3);
    expect(await db.select().from(schema.tranfersTable).where(eq(schema.tranfersTable.senderWallet, sender.wallet.id))).toHaveLength(1);
    const persistedEvents = await uow.execute((tx) => eventRepository.findWalletEvents(tx, sender.wallet.id));
    expect(persistedEvents.map((event) => event.version)).toEqual([1, 2, 3]);
  });

  it('completes opposite-direction concurrent transfers without deadlock or version drift', async () => {
    const a = await createWallet(500n);
    const b = await createWallet(500n);
    const outcomes = await Promise.all([
      transfers.create(a.user.id, b.user.id, '100', randomUUID()),
      transfers.create(b.user.id, a.user.id, '150', randomUUID()),
    ]);
    transferIds.push(...outcomes.map((transfer) => transfer.id));
    const [walletA] = await db.select().from(schema.walletsTable).where(eq(schema.walletsTable.id, a.wallet.id));
    const [walletB] = await db.select().from(schema.walletsTable).where(eq(schema.walletsTable.id, b.wallet.id));
    expect(walletA.balanceCents + walletB.balanceCents).toBe(1000n);
    expect([walletA.balanceCents, walletA.version]).toEqual([550n, 4]);
    expect([walletB.balanceCents, walletB.version]).toEqual([450n, 4]);
    const linked = await db.select().from(schema.eventsTable).where(inArray(schema.eventsTable.operationId, outcomes.map((item) => item.id)));
    expect(linked).toHaveLength(4);
    for (const transfer of outcomes) {
      expect(linked.filter((event) => event.operationId === transfer.id)).toHaveLength(2);
    }
  });

  it('replays the original result without financial effects, including from a new service instance', async () => {
    const sender = await createWallet(100n);
    const receiver = await createWallet();
    const key = randomUUID();
    const original = await transfers.create(sender.user.id, receiver.user.id, '80', key);
    transferIds.push(original.id);
    const replayService = new TransfersService(uow, wallets, events, idempotency, transferRepository);
    const replay = await replayService.create(sender.user.id, receiver.user.id, '080', key.toUpperCase());
    expect(replay).toEqual(original);
    const [from] = await db.select().from(schema.walletsTable).where(eq(schema.walletsTable.id, sender.wallet.id));
    const [to] = await db.select().from(schema.walletsTable).where(eq(schema.walletsTable.id, receiver.wallet.id));
    expect([from.balanceCents, from.version, to.balanceCents, to.version]).toEqual([20n, 3, 80n, 2]);
    expect(await db.select().from(schema.tranfersTable).where(eq(schema.tranfersTable.senderWallet, sender.wallet.id))).toHaveLength(1);
    expect(await db.select().from(schema.eventsTable).where(eq(schema.eventsTable.operationId, original.id))).toHaveLength(2);
    // A retry must work even though re-executing the debit would now fail.
    expect((await transfers.create(sender.user.id, receiver.user.id, '80', key)).id).toBe(original.id);
  });

  it('scopes keys per user and conflicts when one user changes the command', async () => {
    const sender = await createWallet(100n);
    const recipient = await createWallet();
    const other = await createWallet(100n);
    const otherRecipient = await createWallet();
    const key = randomUUID();
    const first = await transfers.create(sender.user.id, recipient.user.id, '10', key);
    transferIds.push(first.id);
    const independentlyScoped = await transfers.create(other.user.id, otherRecipient.user.id, '10', key);
    transferIds.push(independentlyScoped.id);
    await expect(transfers.create(sender.user.id, recipient.user.id, '11', key)).rejects.toBeInstanceOf(IdempotencyKeyReused);
  });

  it('allows only one concurrent identical request to execute', async () => {
    const sender = await createWallet(100n);
    const receiver = await createWallet();
    const key = randomUUID();
    const [a, b] = await Promise.all([
      transfers.create(sender.user.id, receiver.user.id, '20', key),
      transfers.create(sender.user.id, receiver.user.id, '020', key),
    ]);
    expect(a).toEqual(b);
    transferIds.push(a.id);
    expect(await db.select().from(schema.tranfersTable).where(eq(schema.tranfersTable.senderWallet, sender.wallet.id))).toHaveLength(1);
  });

  it('makes concurrent different commands for a key resolve as one success and one conflict', async () => {
    const sender = await createWallet(100n);
    const a = await createWallet();
    const b = await createWallet();
    const key = randomUUID();
    const outcomes = await Promise.allSettled([
      transfers.create(sender.user.id, a.user.id, '20', key),
      transfers.create(sender.user.id, b.user.id, '30', key),
    ]);
    const success = outcomes.filter((item) => item.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof transfers.create>>>[];
    const failure = outcomes.filter((item) => item.status === 'rejected') as PromiseRejectedResult[];
    expect(success).toHaveLength(1);
    expect(failure).toHaveLength(1);
    expect(failure[0].reason).toBeInstanceOf(IdempotencyKeyReused);
    transferIds.push(success[0].value.id);
  });
});

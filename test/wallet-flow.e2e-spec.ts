import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inArray, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { LoginResponseDto } from '../src/auth/dto/login-response.dto.js';
import * as schema from '../src/database/drizzle.schema.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../src/database/unit-of-work.js';
import type { UserResponseDto } from '../src/users/dto/user-response.dto.js';
import { WalletService } from '../src/wallet/wallet.service.js';

type TestUser = { id: string; token: string };
type TransferResponse = {
  id: string;
  senderWallet: string;
  receiverWallet: string;
  amountCents: string;
  status: string;
  createdAt: string;
  reversalOf?: string;
};

describe('wallet financial flow (HTTP + PostgreSQL)', () => {
  let app: INestApplication<App>;
  const userIds: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (!app) return;
    try {
      // Remove only this suite's fixtures, never truncate a shared table.
      if (userIds.length) {
        await app.get<UnitOfWork>(UNIT_OF_WORK).execute(async (tx) => {
          const wallets = await tx
            .select({ id: schema.walletsTable.id })
            .from(schema.walletsTable)
            .where(inArray(schema.walletsTable.userId, userIds));
          const walletIds = wallets.map((wallet) => wallet.id);
          if (walletIds.length) {
            await tx
              .delete(schema.eventsTable)
              .where(inArray(schema.eventsTable.aggregateId, walletIds));
            await tx
              .delete(schema.tranfersTable)
              .where(
                or(
                  inArray(schema.tranfersTable.senderWallet, walletIds),
                  inArray(schema.tranfersTable.receiverWallet, walletIds),
                ),
              );
            await tx
              .delete(schema.walletsTable)
              .where(inArray(schema.walletsTable.id, walletIds));
          }
          await tx
            .delete(schema.sessionsTable)
            .where(inArray(schema.sessionsTable.userId, userIds));
          await tx
            .delete(schema.idempotencyKeysTable)
            .where(inArray(schema.idempotencyKeysTable.userId, userIds));
          await tx
            .delete(schema.usersTable)
            .where(inArray(schema.usersTable.id, userIds));
        });
      }
    } finally {
      await app.close();
    }
  });

  async function register(balanceCents = 0n): Promise<TestUser> {
    const email = `${randomUUID()}@example.test`;
    const password = 'e2e-long-password';
    const registered = await request(app.getHttpServer())
      .post('/users')
      .send({ name: 'Wallet E2E', email, password })
      .expect(201);
    const user = registered.body as UserResponseDto;
    userIds.push(user.id);
    expect(registered.body).not.toHaveProperty('password');

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const { accessToken } = login.body as LoginResponseDto;
    expect(accessToken).toEqual(expect.any(String));

    if (balanceCents > 0n) {
      await app
        .get(WalletService)
        .seedUserWallet(user.id, balanceCents, `e2e-${randomUUID()}`);
    }
    return { id: user.id, token: accessToken };
  }

  function transfer(
    sender: TestUser,
    receiver: TestUser,
    amountCents: string,
    key: string = randomUUID(),
  ) {
    return request(app.getHttpServer())
      .post('/transfers')
      .auth(sender.token, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send({ recipientUserId: receiver.id, amountCents });
  }

  function reverse(user: TestUser, id: string, key: string = randomUUID()) {
    return request(app.getHttpServer())
      .post(`/transfers/${id}/reverse`)
      .auth(user.token, { type: 'bearer' })
      .set('Idempotency-Key', key);
  }

  async function expectBalance(user: TestUser, balance: string) {
    const response = await request(app.getHttpServer())
      .get('/wallets')
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(response.body).toEqual({ walletId: expect.any(String), balance });
  }

  async function expectHistory(user: TestUser, items: object[]) {
    const response = await request(app.getHttpServer())
      .get('/wallets/history')
      .auth(user.token, { type: 'bearer' })
      .expect(200);
    expect(response.body).toEqual({
      items: items.map((item) => expect.objectContaining(item)),
      nextCursor: null,
    });
  }

  it('registers, authenticates, transfers and reverses without duplicating financial effects', async () => {
    const sender = await register(10000n);
    const receiver = await register();
    await expectBalance(sender, '10000');
    await expectBalance(receiver, '0');
    const createKey = randomUUID();
    const created = await transfer(sender, receiver, '2500', createKey).expect(
      201,
    );
    const original = created.body as TransferResponse;
    expect(original).toMatchObject({
      amountCents: '2500',
      status: 'COMPLETED',
    });
    const retried = await transfer(
      sender,
      receiver,
      '02500',
      createKey.toUpperCase(),
    ).expect(201);
    expect(retried.body).toEqual(created.body);
    await expectBalance(sender, '7500');
    await expectBalance(receiver, '2500');
    await expectHistory(sender, [
      {
        operationId: original.id,
        direction: 'OUTGOING',
        status: 'COMPLETED',
        amountCents: '2500',
      },
    ]);

    const reusedCreationKey = await reverse(
      sender,
      original.id,
      createKey,
    ).expect(409);
    expect(reusedCreationKey.body).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });

    const reverseKey = randomUUID();
    const reversed = await reverse(sender, original.id, reverseKey).expect(201);
    const reversal = reversed.body as TransferResponse;
    expect(reversal).toMatchObject({
      senderWallet: original.receiverWallet,
      receiverWallet: original.senderWallet,
      amountCents: '2500',
      status: 'COMPLETED',
      reversalOf: original.id,
    });
    const repeatedReversal = await reverse(
      sender,
      original.id,
      reverseKey,
    ).expect(201);
    expect(repeatedReversal.body).toEqual(reversed.body);
    const repeatedCreation = await transfer(
      sender,
      receiver,
      '2500',
      createKey,
    ).expect(201);
    expect(repeatedCreation.body).toEqual(created.body);
    const reusedReversalKey = await transfer(
      sender,
      receiver,
      '2500',
      reverseKey,
    ).expect(409);
    expect(reusedReversalKey.body).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    await expectBalance(sender, '10000');
    await expectBalance(receiver, '0');
    await expectHistory(sender, [
      {
        operationId: reversal.id,
        type: 'REVERSAL',
        direction: 'INCOMING',
        reversalOf: original.id,
        amountCents: '2500',
        status: 'COMPLETED',
      },
      {
        operationId: original.id,
        type: 'TRANSFER',
        direction: 'OUTGOING',
        status: 'REVERSED',
        reversalOf: null,
      },
    ]);
    await expectHistory(receiver, [
      {
        operationId: reversal.id,
        type: 'REVERSAL',
        direction: 'OUTGOING',
        reversalOf: original.id,
      },
      {
        operationId: original.id,
        type: 'TRANSFER',
        direction: 'INCOMING',
        status: 'REVERSED',
      },
    ]);
  });

  it('requires authentication for wallet reads and financial commands', async () => {
    await request(app.getHttpServer()).get('/wallets').expect(401);
    await request(app.getHttpServer()).get('/wallets/history').expect(401);
    await request(app.getHttpServer())
      .post('/transfers')
      .set('Idempotency-Key', randomUUID())
      .send({ recipientUserId: randomUUID(), amountCents: '10' })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/transfers/${randomUUID()}/reverse`)
      .set('Idempotency-Key', randomUUID())
      .expect(401);
  });

  it('rejects a forged sender rather than accepting undeclared fields', async () => {
    const sender = await register(100n);
    const receiver = await register();
    await request(app.getHttpServer())
      .post('/transfers')
      .auth(sender.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({
        recipientUserId: receiver.id,
        amountCents: '50',
        senderUserId: receiver.id,
      })
      .expect(400);
    await expectBalance(sender, '100');
    await expectBalance(receiver, '0');
    await expectHistory(sender, []);
  });

  it('does not let the recipient or another user reverse the original transfer', async () => {
    const sender = await register(100n);
    const receiver = await register();
    const other = await register();
    const response = await transfer(sender, receiver, '50').expect(201);
    const original = response.body as TransferResponse;
    for (const user of [receiver, other]) {
      const denied = await reverse(user, original.id).expect(404);
      expect(denied.body).toMatchObject({ code: 'TRANSFER_NOT_FOUND' });
    }
    await expectBalance(sender, '50');
    await expectBalance(receiver, '50');
    await expectHistory(sender, [
      { operationId: original.id, status: 'COMPLETED' },
    ]);
  });

  it('rejects reversal after funds are spent without partial effects', async () => {
    const sender = await register(100n);
    const receiver = await register();
    const destination = await register();
    const response = await transfer(sender, receiver, '80').expect(201);
    const original = response.body as TransferResponse;
    await transfer(receiver, destination, '80').expect(201);
    const denied = await reverse(sender, original.id).expect(422);
    expect(denied.body).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    await expectBalance(sender, '20');
    await expectBalance(receiver, '0');
    await expectBalance(destination, '80');
    await expectHistory(sender, [
      { operationId: original.id, status: 'COMPLETED' },
    ]);
  });

  it('rejects a second reversal with a new key and reversal of a compensation', async () => {
    const sender = await register(100n);
    const receiver = await register();
    const response = await transfer(sender, receiver, '30').expect(201);
    const original = response.body as TransferResponse;
    const reversed = await reverse(sender, original.id).expect(201);
    const reversal = reversed.body as TransferResponse;
    const duplicate = await reverse(sender, original.id).expect(409);
    expect(duplicate.body).toMatchObject({ code: 'TRANSFER_NOT_REVERSIBLE' });
    const compensation = await reverse(receiver, reversal.id).expect(409);
    expect(compensation.body).toMatchObject({
      code: 'TRANSFER_NOT_REVERSIBLE',
    });
    await expectBalance(sender, '100');
    await expectBalance(receiver, '0');
    await expectHistory(sender, [
      { operationId: reversal.id, reversalOf: original.id },
      { operationId: original.id, status: 'REVERSED' },
    ]);
  });
});

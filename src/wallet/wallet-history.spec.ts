import { BadRequestException } from '@nestjs/common';
import { WalletHistoryService } from './wallet-history.js';

describe('WalletHistoryService', () => {
  const wallet = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  const repository = {
    findUserWallet: vi.fn().mockResolvedValue(wallet),
    findHistoryPage: vi.fn().mockResolvedValue([]),
  };
  const uow = { execute: (work: (tx: object) => unknown) => work({}) };
  const service = new WalletHistoryService(uow as never, repository as never);

  beforeEach(() => vi.clearAllMocks());

  it('returns an empty history and requests a default page', async () => {
    await expect(service.history('user-id')).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(repository.findHistoryPage).toHaveBeenCalledWith(
      {},
      wallet.id,
      21,
      undefined,
    );
  });

  it.each(['0', '101', '1.5', '-1', 'abc'])(
    'rejects invalid limit %s',
    async (limit) => {
      await expect(service.history('user-id', limit)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('rejects a malformed cursor', async () => {
    await expect(
      service.history('user-id', undefined, 'not-a-cursor'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves timestamp microseconds in the next-page cursor', async () => {
    const firstId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const timestamp = '2026-10-30T12:34:56.123456Z';
    const transfer = {
      id: firstId,
      reversalOf: null,
      senderWallet: wallet.id,
      receiverWallet: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      amountCents: 123n,
      status: 'COMPLETED',
      createdAt: new Date('2026-10-30T12:34:56.123Z'),
      createdAtExact: timestamp,
    };
    repository.findHistoryPage.mockResolvedValueOnce([transfer, transfer]);

    const page = await service.history('user-id', '1');
    expect(page.items[0]?.createdAt).toBe(timestamp);
    expect(page.nextCursor).toBeTruthy();
    const encodedCursor = page.nextCursor as string;
    const cursor = JSON.parse(
      Buffer.from(encodedCursor, 'base64url').toString(),
    );
    expect(cursor).toEqual({ createdAt: timestamp, id: firstId });

    await service.history('user-id', '1', encodedCursor);
    expect(repository.findHistoryPage).toHaveBeenLastCalledWith(
      {},
      wallet.id,
      2,
      { createdAt: timestamp, id: firstId },
    );
  });
});

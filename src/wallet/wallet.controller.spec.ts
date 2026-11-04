import { WalletController } from './wallet.controller.js';

describe('WalletController history', () => {
  it('uses only the authenticated user id and passes pagination through', async () => {
    const service = { history: vi.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    const controller = new WalletController({} as never, service as never);

    await expect(
      controller.history(
        { id: 'authenticated-user', email: 'user@example.test', name: 'User', sessionId: 'session' },
        '5',
        'opaque-cursor',
      ),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(service.history).toHaveBeenCalledWith('authenticated-user', '5', 'opaque-cursor');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { TransfersController } from './transfers.controller.js';

describe('TransfersController', () => {
  it('takes sender identity from the authenticated user', async () => {
    const transfers = { create: vi.fn().mockResolvedValue({ id: 'transfer-id' }) };
    const controller = new TransfersController(transfers as never);
    const result = await controller.create(
      { id: 'authenticated-sender' } as never,
      { recipientUserId: 'recipient', amountCents: '125' },
    );
    expect(transfers.create).toHaveBeenCalledWith('authenticated-sender', 'recipient', '125');
    expect(result).toEqual({ id: 'transfer-id' });
  });
});

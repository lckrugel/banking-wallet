import { describe, expect, it, vi } from 'vitest';
import { TransfersController } from './transfers.controller.js';
import { BadRequestException } from '@nestjs/common';

describe('TransfersController', () => {
  it('takes sender identity from the authenticated user', async () => {
    const transfers = { create: vi.fn().mockResolvedValue({ id: 'transfer-id' }) };
    const controller = new TransfersController(transfers as never);
    const result = await controller.create(
      { id: 'authenticated-sender' } as never,
      { recipientUserId: 'recipient', amountCents: '125' },
      'AABBCCDD-0000-4000-8000-000000000001',
    );
    expect(transfers.create).toHaveBeenCalledWith('authenticated-sender', 'recipient', '125', 'aabbccdd-0000-4000-8000-000000000001');
    expect(result).toEqual({ id: 'transfer-id' });
  });

  it.each([undefined, 'not-a-uuid'])('rejects missing or malformed key %s', async (key) => {
    const transfers = { create: vi.fn() };
    const controller = new TransfersController(transfers as never);
    expect(() => controller.create({ id: 'user' } as never, { recipientUserId: 'recipient', amountCents: '1' }, key))
      .toThrow(BadRequestException);
    expect(transfers.create).not.toHaveBeenCalled();
  });

  it('validates and normalizes reverse IDs and keys', async () => {
    const transfers = { reverse: vi.fn().mockReturnValue({ id: 'reversal' }) };
    const controller = new TransfersController(transfers as never);
    await controller.reverse({ id: 'authenticated-sender' } as never, 'AABBCCDD-0000-4000-8000-000000000001', 'AABBCCDD-0000-4000-8000-000000000002');
    expect(transfers.reverse).toHaveBeenCalledWith('authenticated-sender', 'aabbccdd-0000-4000-8000-000000000001', 'aabbccdd-0000-4000-8000-000000000002');
    expect(() => controller.reverse({ id: 'user' } as never, 'invalid', 'aabbccdd-0000-4000-8000-000000000002')).toThrow(BadRequestException);
    expect(() => controller.reverse({ id: 'user' } as never, 'aabbccdd-0000-4000-8000-000000000001', undefined)).toThrow(BadRequestException);
  });
});

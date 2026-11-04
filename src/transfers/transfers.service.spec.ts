import { describe, expect, it } from 'vitest';
import { createTransferFingerprint } from './transfers.service.js';

describe('transfer fingerprint', () => {
  it('canonicalizes recipient UUID casing and bigint amount representation', () => {
    expect(createTransferFingerprint('AABBCCDD-0000-4000-8000-000000000001', 125n))
      .toBe(createTransferFingerprint('aabbccdd-0000-4000-8000-000000000001', BigInt('00125')));
  });
});

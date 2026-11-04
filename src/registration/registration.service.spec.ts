import type { DatabaseTransaction } from '../database/database.types.js';
import type { UnitOfWork } from '../database/unit-of-work.js';
import { PasswordHasher } from '../auth/password-hasher.service.js';
import { UsersRepository } from '../users/users.repository.js';
import { WalletService } from '../wallet/wallet.service.js';
import { RegistrationService } from './registration.service.js';

describe('RegistrationService', () => {
  const tx = {} as DatabaseTransaction;
  const users = { create: vi.fn() };
  const wallet = { createForUser: vi.fn() };
  const passwordHasher = { hash: vi.fn() };
  const uow = {
    execute: vi.fn(
      <T>(work: (transaction: DatabaseTransaction) => Promise<T>) => work(tx),
    ),
  };
  let service: RegistrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RegistrationService(
      users as unknown as UsersRepository,
      wallet as unknown as WalletService,
      passwordHasher as unknown as PasswordHasher,
      uow as unknown as UnitOfWork,
    );
  });

  it('hashes the password and creates the user within a transaction', async () => {
    passwordHasher.hash.mockResolvedValue('argon2id$hashed-password');
    users.create.mockResolvedValue({
      id: 'user-id',
      email: 'person@example.com',
      name: 'Person',
    });
    wallet.createForUser.mockResolvedValue(undefined);

    const result = await service.register({
      email: 'person@example.com',
      password: 'secret1',
      name: 'Person',
    });

    expect(passwordHasher.hash).toHaveBeenCalledWith('secret1');
    expect(users.create).toHaveBeenCalledWith(tx, {
      email: 'person@example.com',
      password: 'argon2id$hashed-password',
      name: 'Person',
    });
    expect(wallet.createForUser).toHaveBeenCalledWith(tx, 'user-id');
    expect(result).not.toHaveProperty('password');
    expect(uow.execute).toHaveBeenCalledOnce();
  });
});

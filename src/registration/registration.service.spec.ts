import type { Database } from '../database/database.types.js';
import type { DatabaseTransaction } from '../database/database.types.js';
import { PasswordHasher } from '../auth/password-hasher.service.js';
import { UsersService } from '../users/users.service.js';
import { RegistrationService } from './registration.service.js';

describe('RegistrationService', () => {
  const tx = {} as DatabaseTransaction;
  const users = { create: vi.fn() };
  const passwordHasher = { hash: vi.fn() };
  const db = {
    transaction: vi.fn(
      (callback: (transaction: DatabaseTransaction) => unknown) =>
        Promise.resolve(callback(tx)),
    ),
  };
  let service: RegistrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RegistrationService(
      db as unknown as Database,
      users as unknown as UsersService,
      passwordHasher as unknown as PasswordHasher,
    );
  });

  it('hashes the password and creates the user within a transaction', async () => {
    passwordHasher.hash.mockResolvedValue('argon2id$hashed-password');
    users.create.mockResolvedValue({
      id: 'user-id',
      email: 'person@example.com',
      name: 'Person',
    });

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
    expect(result).not.toHaveProperty('password');
    expect(db.transaction).toHaveBeenCalledOnce();
  });
});

import { JwtService } from '@nestjs/jwt';
import type { Database } from '../database/database.types.js';
import type { DatabaseTransaction } from '../database/database.types.js';
import { UsersService } from '../users/users.service.js';
import { AuthRepository } from './auth.repository.js';
import { PasswordHasher } from './password-hasher.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const tx = {} as DatabaseTransaction;
  const repository = {
    createSession: vi.fn(),
    findActiveSession: vi.fn(),
    revokeSession: vi.fn(),
  };
  const users = { findByEmail: vi.fn() };
  const passwordHasher = { verify: vi.fn() };
  const jwt = { signAsync: vi.fn() };
  const db = {
    transaction: vi.fn(
      (callback: (transaction: DatabaseTransaction) => unknown) =>
        Promise.resolve(callback(tx)),
    ),
  };
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(
      db as unknown as Database,
      repository as unknown as AuthRepository,
      jwt as unknown as JwtService,
      users as unknown as UsersService,
      passwordHasher as unknown as PasswordHasher,
    );
  });

  it('creates a persisted session and returns a JWT after valid login', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'person@example.com',
      password: 'stored-hash',
      name: 'Person',
    });
    passwordHasher.verify.mockResolvedValue(true);
    repository.createSession.mockResolvedValue({ id: 'session-id' });
    jwt.signAsync.mockResolvedValue('signed-token');

    const result = await service.login('person@example.com', 'secret1');

    expect(users.findByEmail).toHaveBeenCalledWith(tx, 'person@example.com');
    expect(passwordHasher.verify).toHaveBeenCalledWith(
      'stored-hash',
      'secret1',
    );
    expect(repository.createSession).toHaveBeenCalledWith(
      tx,
      'user-id',
      expect.any(Date),
    );
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'user-id', sid: 'session-id' },
      { expiresIn: '1h' },
    );
    expect(result).toEqual({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      expiresIn: 3600,
    });
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['unknown email', undefined],
    [
      'wrong password',
      {
        id: 'user-id',
        email: 'person@example.com',
        password: 'stored-hash',
        name: 'Person',
      },
    ],
  ])(
    'rejects login with the same credentials error for %s',
    async (_, user) => {
      users.findByEmail.mockResolvedValue(user);
      passwordHasher.verify.mockResolvedValue(false);

      await expect(
        service.login('person@example.com', 'secret1'),
      ).rejects.toMatchObject({
        response: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
      expect(repository.createSession).not.toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    },
  );
});

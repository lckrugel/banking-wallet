import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { Database } from '../database/database.types.js';
import type { DatabaseTransaction } from '../database/database.types.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';

vi.mock('argon2', () => ({
  hash: vi.fn(),
  verify: vi.fn(),
  argon2id: 2,
}));

describe('AuthService', () => {
  const tx = {} as DatabaseTransaction;
  const repository = {
    createUser: vi.fn(),
    findUserByEmail: vi.fn(),
    createSession: vi.fn(),
    findActiveSession: vi.fn(),
    revokeSession: vi.fn(),
  };
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
    );
  });

  it('hashes the password before persisting a registered user', async () => {
    vi.mocked(argon2.hash).mockResolvedValue('argon2id$hashed-password');
    repository.createUser.mockResolvedValue({
      id: 'user-id',
      email: 'person@example.com',
      name: 'Person',
    });

    const result = await service.register({
      email: 'person@example.com',
      password: 'secret1',
      name: 'Person',
    });

    expect(argon2.hash).toHaveBeenCalledWith('secret1', {
      type: argon2.argon2id,
    });
    expect(repository.createUser).toHaveBeenCalledWith(tx, {
      email: 'person@example.com',
      password: 'argon2id$hashed-password',
      name: 'Person',
    });
    expect(result).not.toHaveProperty('password');
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  it('creates a persisted session and returns a JWT after valid login', async () => {
    repository.findUserByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'person@example.com',
      password: 'stored-hash',
      name: 'Person',
    });
    vi.mocked(argon2.verify).mockResolvedValue(true);
    repository.createSession.mockResolvedValue({ id: 'session-id' });
    jwt.signAsync.mockResolvedValue('signed-token');

    const result = await service.login('person@example.com', 'secret1');

    expect(argon2.verify).toHaveBeenCalledWith('stored-hash', 'secret1');
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
      repository.findUserByEmail.mockResolvedValue(user);
      vi.mocked(argon2.verify).mockResolvedValue(false);

      const login = service.login('person@example.com', 'secret1');

      await expect(login).rejects.toMatchObject({
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

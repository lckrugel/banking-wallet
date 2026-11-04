import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UNIT_OF_WORK, type UnitOfWork } from '../database/unit-of-work.js';
import { AuthRepository } from './auth.repository.js';
import { PasswordHasher } from './password-hasher.service.js';
import { UsersRepository } from '../users/users.repository.js';
import type { AuthenticatedUser } from './auth.guard.js';
import type { LoginResponseDto } from './dto/login-response.dto.js';

export const SESSION_DURATION_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
    private readonly users: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async login(email: string, password: string): Promise<LoginResponseDto> {
    const user = await this.uow.execute((tx) =>
      this.users.findByEmail(tx, email),
    );
    if (!user || !(await this.passwordHasher.verify(user.password, password))) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const session = await this.uow.execute((tx) =>
      this.repository.createSession(tx, user.id, expiresAt),
    );
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, sid: session.id },
      { expiresIn: '1h' },
    );
    return { accessToken, tokenType: 'Bearer', expiresIn: 3600 };
  }

  async authenticate(
    sessionId: string,
    userId: string,
  ): Promise<AuthenticatedUser> {
    const user = await this.uow.execute((tx) =>
      this.repository.findActiveSession(tx, sessionId, userId),
    );
    if (!user) throw new UnauthorizedException();
    return {
      id: user.userId,
      email: user.email,
      name: user.name,
      sessionId: user.id,
    };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.uow.execute((tx) =>
      this.repository.revokeSession(tx, sessionId, userId),
    );
  }
}

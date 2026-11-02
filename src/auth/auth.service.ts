import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Database } from '../database/database.types.js';
import * as argon2 from 'argon2';
import { AuthRepository } from './auth.repository.js';

export const SESSION_DURATION_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
  ) {}

  async register(input: { email: string; password: string; name: string }) {
    const password = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    return this.db.transaction((tx) =>
      this.repository.createUser(tx, { ...input, password }),
    );
  }

  async login(email: string, password: string) {
    const user = await this.db.transaction((tx) =>
      this.repository.findUserByEmail(tx, email),
    );
    if (!user || !(await argon2.verify(user.password, password))) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const session = await this.db.transaction((tx) =>
      this.repository.createSession(tx, user.id, expiresAt),
    );
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, sid: session.id },
      { expiresIn: '1h' },
    );
    return { accessToken, tokenType: 'Bearer', expiresIn: 3600 };
  }

  async authenticate(sessionId: string, userId: string) {
    const user = await this.db.transaction((tx) =>
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

  async logout(sessionId: string, userId: string) {
    await this.db.transaction((tx) =>
      this.repository.revokeSession(tx, sessionId, userId),
    );
  }
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  sessionId: string;
}

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(
        token,
      );
      if (!payload.sub || !payload.sid) throw new Error('Invalid token claims');
      request.user = await this.auth.authenticate(payload.sid, payload.sub);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

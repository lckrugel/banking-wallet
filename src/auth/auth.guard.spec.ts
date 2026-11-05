import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';

describe('AuthGuard', () => {
  const user = {
    id: 'user-id',
    email: 'person@example.com',
    name: 'Person',
    sessionId: 'session-id',
  };
  const jwt = { verifyAsync: vi.fn() };
  const auth = { authenticate: vi.fn() };
  let guard: AuthGuard;

  const contextFor = (authorization?: string) => {
    const request: { headers: { authorization?: string }; user?: typeof user } =
      {
        headers: { authorization },
      };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new AuthGuard(
      jwt as unknown as JwtService,
      auth as unknown as AuthService,
    );
  });

  it('rejects a request without a bearer token', async () => {
    const { context } = contextFor();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it.each(['Basic token', 'Bearer', 'Bearer token extra'])(
    'rejects malformed authorization header: %s',
    async (authorization) => {
      const { context } = contextFor(authorization);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('rejects invalid or expired JWTs', async () => {
    const { context } = contextFor('Bearer expired-token');
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auth.authenticate).not.toHaveBeenCalled();
  });

  it('rejects a token without required user and session claims', async () => {
    const { context } = contextFor('Bearer token');
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-id' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auth.authenticate).not.toHaveBeenCalled();
  });

  it('rejects a token when its session is no longer active', async () => {
    const { context } = contextFor('Bearer token');
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-id', sid: 'session-id' });
    auth.authenticate.mockRejectedValue(new UnauthorizedException());

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('does not turn a session lookup failure into an invalid token', async () => {
    const { context } = contextFor('Bearer token');
    const failure = new Error('Database unavailable');
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-id', sid: 'session-id' });
    auth.authenticate.mockRejectedValue(failure);

    await expect(guard.canActivate(context)).rejects.toBe(failure);
  });

  it('attaches the authenticated identity when JWT and session are valid', async () => {
    const { context, request } = contextFor('Bearer valid-token');
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-id', sid: 'session-id' });
    auth.authenticate.mockResolvedValue(user);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(auth.authenticate).toHaveBeenCalledWith('session-id', 'user-id');
    expect(request.user).toEqual(user);
  });
});

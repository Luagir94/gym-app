import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';

function buildContext(role: string | null, metadata: string[] | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: role ? { userId: 'u1', tenantId: 't1', role } : null,
      }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows access when no @Roles decorator is applied (route is public)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = buildContext('MEMBER', undefined);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows an ADMIN token to access an admin-only route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const ctx = buildContext('ADMIN', ['ADMIN']);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies a MEMBER token on an admin-only route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const ctx = buildContext('MEMBER', ['ADMIN']);

    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('allows a MEMBER token to access a member-only route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['MEMBER']);
    const ctx = buildContext('MEMBER', ['MEMBER']);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies access when request has no user (unauthenticated)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const ctx = buildContext(null, ['ADMIN']);

    expect(guard.canActivate(ctx)).toBe(false);
  });
});

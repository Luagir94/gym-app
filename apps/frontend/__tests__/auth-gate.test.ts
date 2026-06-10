/**
 * Tests for the Better Auth gate logic extracted as pure functions.
 *
 * Covers:
 * - Fix 1a: user.create.before — email lookup in pre-registration store, tenantId/role injection
 * - Fix 1b: session.create.before — per-sign-in re-check blocks deactivated users
 * - Fix 2: definePayload throws when tenantId is missing
 */

import {
  addPreRegistration,
  clearAllRegistrations,
} from '../lib/pre-registration-store';

import {
  checkUserCreateGate,
  checkSessionCreateGate,
  buildDefinePayload,
} from '../lib/auth-gate';

describe('auth-gate — user.create.before logic', () => {
  beforeEach(() => {
    clearAllRegistrations();
  });

  it('injects tenantId and role from pre-registration when email matches', async () => {
    addPreRegistration('alice@example.com', 'tenant-a');

    const result = await checkUserCreateGate({ email: 'alice@example.com' }, 'tenant-a', 'MEMBER');

    expect(result.tenantId).toBe('tenant-a');
    expect(result.role).toBe('MEMBER');
    expect(result.email).toBe('alice@example.com');
  });

  it('throws when email is not pre-registered (unknown user)', async () => {
    await expect(
      checkUserCreateGate({ email: 'unknown@example.com' }, null, null),
    ).rejects.toThrow('not pre-registered');
  });

  it('throws when email is pre-registered for a different tenant only', async () => {
    addPreRegistration('alice@example.com', 'tenant-b');

    await expect(
      checkUserCreateGate({ email: 'alice@example.com' }, 'tenant-a', 'MEMBER'),
    ).rejects.toThrow('not pre-registered');
  });

  it('normalizes email to lowercase before lookup', async () => {
    addPreRegistration('alice@example.com', 'tenant-a');

    // Incoming email from OAuth might be mixed-case
    const result = await checkUserCreateGate({ email: 'ALICE@example.com' }, 'tenant-a', 'MEMBER');

    expect(result.tenantId).toBe('tenant-a');
    expect(result.email).toBe('ALICE@example.com');
  });
});

describe('auth-gate — session.create.before logic', () => {
  beforeEach(() => {
    clearAllRegistrations();
  });

  it('allows session creation when user email is still pre-registered', async () => {
    addPreRegistration('alice@example.com', 'tenant-a');

    // Should not throw
    await expect(
      checkSessionCreateGate('alice@example.com', 'tenant-a'),
    ).resolves.toBeUndefined();
  });

  it('throws when user email has been removed from pre-registration (deactivated member)', async () => {
    // alice was pre-registered but has since been removed (deactivated)
    // No addPreRegistration call — store is empty

    await expect(
      checkSessionCreateGate('alice@example.com', 'tenant-a'),
    ).rejects.toThrow('not pre-registered');
  });

  it('throws when user has no tenantId stored (incomplete user record)', async () => {
    addPreRegistration('alice@example.com', 'tenant-a');

    // tenantId null simulates an incomplete user (should never create a session)
    await expect(
      checkSessionCreateGate('alice@example.com', null),
    ).rejects.toThrow('No tenant context');
  });
});

describe('auth-gate — buildDefinePayload', () => {
  it('returns tenantId and role claims when both are present', () => {
    const result = buildDefinePayload({ tenantId: 'tenant-a', role: 'ADMIN' });

    expect(result.tenantId).toBe('tenant-a');
    expect(result.role).toBe('ADMIN');
  });

  it('throws when tenantId is null (instead of emitting null claim)', () => {
    expect(() => buildDefinePayload({ tenantId: null, role: 'MEMBER' })).toThrow(
      'tenantId is required',
    );
  });

  it('throws when tenantId is undefined', () => {
    expect(() => buildDefinePayload({ tenantId: undefined, role: 'MEMBER' })).toThrow(
      'tenantId is required',
    );
  });

  it('uses MEMBER as default role when role is falsy', () => {
    const result = buildDefinePayload({ tenantId: 'tenant-a', role: undefined });

    expect(result.role).toBe('MEMBER');
  });
});

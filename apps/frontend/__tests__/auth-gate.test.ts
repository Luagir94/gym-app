/**
 * Tests for the Better Auth gate logic extracted as pure functions.
 *
 * PR3 update: pre-registration-store now uses Prisma (async).
 * These tests mock the Prisma client to stay as unit tests.
 *
 * Covers:
 * - Fix 1a: user.create.before — email lookup in pre-registration store, tenantId/role injection
 * - Fix 1b: session.create.before — per-sign-in re-check blocks deactivated users
 * - Fix 2: definePayload throws when tenantId is missing
 */

// jest.mock is hoisted before const declarations.
// Use __mocks__ approach: define mock inside factory, retrieve via jest.requireMock.
jest.mock('../../backend/generated/prisma/index.js', () => {
  const findFirst = jest.fn();
  const MockPrismaClient = jest.fn().mockImplementation(() => ({
    preRegistration: {
      findFirst,
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  }));
  (MockPrismaClient as any).__findFirst = findFirst;
  return { PrismaClient: MockPrismaClient };
});

import {
  checkUserCreateGate,
  checkSessionCreateGate,
  buildDefinePayload,
} from '../lib/auth-gate';

// Helper to get the findFirst mock (created inside jest.mock factory)
function getFindFirst(): jest.Mock {
  const { PrismaClient } = jest.requireMock('../../backend/generated/prisma/index.js');
  return (PrismaClient as any).__findFirst as jest.Mock;
}

// Helper: create a pre-registration mock entry
function mockPreReg(email: string, tenantId: string, role = 'MEMBER', active = true) {
  return {
    id: 'pre-1',
    email,
    tenantId,
    role,
    active,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('auth-gate — user.create.before logic', () => {
  beforeEach(() => {
    getFindFirst().mockReset();
  });

  it('injects tenantId and role from pre-registration when email matches', async () => {
    getFindFirst().mockResolvedValue(mockPreReg('alice@example.com', 'tenant-a'));

    const result = await checkUserCreateGate({ email: 'alice@example.com' });

    expect(result.tenantId).toBe('tenant-a');
    expect(result.role).toBe('MEMBER');
    expect(result.email).toBe('alice@example.com');
  });

  it('injects the role stored in the pre-registration entry', async () => {
    getFindFirst().mockResolvedValue(mockPreReg('admin@example.com', 'tenant-a', 'ADMIN'));

    const result = await checkUserCreateGate({ email: 'admin@example.com' });

    expect(result.role).toBe('ADMIN');
  });

  it('throws when email is not pre-registered (unknown user)', async () => {
    getFindFirst().mockResolvedValue(null);

    await expect(
      checkUserCreateGate({ email: 'unknown@example.com' }),
    ).rejects.toThrow('not pre-registered');
  });

  it('resolves the tenant from the store, never from the caller', async () => {
    getFindFirst().mockResolvedValue(mockPreReg('alice@example.com', 'tenant-b'));

    const result = await checkUserCreateGate({ email: 'alice@example.com' });

    expect(result.tenantId).toBe('tenant-b');
  });

  it('normalizes email to lowercase before lookup', async () => {
    getFindFirst().mockResolvedValue(mockPreReg('alice@example.com', 'tenant-a'));

    // Incoming email from OAuth might be mixed-case
    const result = await checkUserCreateGate({ email: 'ALICE@example.com' });

    expect(result.tenantId).toBe('tenant-a');
    // The original (non-normalized) email is preserved in the returned data
    expect(result.email).toBe('ALICE@example.com');
  });
});

describe('auth-gate — session.create.before logic', () => {
  beforeEach(() => {
    getFindFirst().mockReset();
  });

  it('returns true when user email is still pre-registered', async () => {
    getFindFirst().mockResolvedValue(mockPreReg('alice@example.com', 'tenant-a'));

    await expect(
      checkSessionCreateGate('alice@example.com', 'tenant-a'),
    ).resolves.toBe(true);
  });

  it('returns false when user email has been removed from pre-registration (deactivated member)', async () => {
    getFindFirst().mockResolvedValue(null);

    await expect(
      checkSessionCreateGate('alice@example.com', 'tenant-a'),
    ).resolves.toBe(false);
  });

  it('returns false when user has no tenantId stored (incomplete user record)', async () => {
    await expect(
      checkSessionCreateGate('alice@example.com', null),
    ).resolves.toBe(false);

    // Should short-circuit before calling Prisma
    expect(getFindFirst()).not.toHaveBeenCalled();
  });

  it('returns false when the email is registered for a different tenant than the user record', async () => {
    getFindFirst().mockResolvedValue(null); // query for (email, tenant-a) returns null

    await expect(
      checkSessionCreateGate('alice@example.com', 'tenant-a'),
    ).resolves.toBe(false);
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

/**
 * Tests for the pre-registration store — Prisma-backed implementation (PR3).
 *
 * The store functions are now async (Prisma queries).
 * PrismaClient is mocked to avoid needing a real DB connection.
 */

// jest.mock is hoisted — use __mocks approach to share references
jest.mock('../../backend/generated/prisma/index.js', () => {
  const findFirst = jest.fn();
  const upsert = jest.fn().mockResolvedValue({});
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const MockPrismaClient = jest.fn().mockImplementation(() => ({
    preRegistration: { findFirst, upsert, deleteMany },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  }));
  (MockPrismaClient as any).__ops = { findFirst, upsert, deleteMany };
  return { PrismaClient: MockPrismaClient };
});

import {
  isEmailPreRegistered,
  addPreRegistration,
  removePreRegistration,
  clearAllRegistrations,
} from '../lib/pre-registration-store';

function getOps() {
  const { PrismaClient } = jest.requireMock('../../backend/generated/prisma/index.js');
  return (PrismaClient as any).__ops as {
    findFirst: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
}

function preRegEntry(email: string, tenantId: string, role = 'MEMBER', active = true) {
  return { id: 'p1', email, tenantId, role, active, createdAt: new Date(), updatedAt: new Date() };
}

describe('Pre-registration store (Prisma-backed)', () => {
  beforeEach(() => {
    const ops = getOps();
    ops.findFirst.mockReset();
    ops.upsert.mockReset().mockResolvedValue({});
    ops.deleteMany.mockReset().mockResolvedValue({ count: 1 });
    process.env.NODE_ENV = 'test';
  });

  it('returns true when email+tenantId is pre-registered and active', async () => {
    getOps().findFirst.mockResolvedValue(preRegEntry('alice@example.com', 'tenant-a'));

    const result = await isEmailPreRegistered('alice@example.com', 'tenant-a');

    expect(result).toBe(true);
    expect(getOps().findFirst).toHaveBeenCalledWith({
      where: { email: 'alice@example.com', tenantId: 'tenant-a', active: true },
    });
  });

  it('returns false when email is not pre-registered in any tenant', async () => {
    getOps().findFirst.mockResolvedValue(null);

    const result = await isEmailPreRegistered('bob@example.com', 'tenant-a');

    expect(result).toBe(false);
  });

  it('returns false when email is pre-registered in a different tenant', async () => {
    getOps().findFirst.mockResolvedValue(null);

    const result = await isEmailPreRegistered('carol@example.com', 'tenant-a');

    expect(result).toBe(false);
  });

  it('normalizes email case — uppercase lookup matches lowercase pre-reg', async () => {
    getOps().findFirst.mockResolvedValue(preRegEntry('alice@example.com', 'tenant-a'));

    const result = await isEmailPreRegistered('ALICE@example.com', 'tenant-a');

    expect(result).toBe(true);
    // Verifies normalization happened before the DB call
    expect(getOps().findFirst).toHaveBeenCalledWith({
      where: { email: 'alice@example.com', tenantId: 'tenant-a', active: true },
    });
  });

  it('addPreRegistration() calls upsert with normalized email', async () => {
    await addPreRegistration('ALICE@example.com', 'tenant-a', 'MEMBER');

    expect(getOps().upsert).toHaveBeenCalledWith({
      where: { tenantId_email: { tenantId: 'tenant-a', email: 'alice@example.com' } },
      update: { active: true, role: 'MEMBER' },
      create: {
        email: 'alice@example.com',
        tenantId: 'tenant-a',
        role: 'MEMBER',
        active: true,
      },
    });
  });

  it('removePreRegistration() calls deleteMany with email and tenantId', async () => {
    await removePreRegistration('alice@example.com', 'tenant-a');

    expect(getOps().deleteMany).toHaveBeenCalledWith({
      where: { email: 'alice@example.com', tenantId: 'tenant-a' },
    });
  });

  it('clearAllRegistrations() calls deleteMany({}) in test environment', async () => {
    await clearAllRegistrations();

    expect(getOps().deleteMany).toHaveBeenCalledWith({});
  });
});

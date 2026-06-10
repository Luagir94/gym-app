/**
 * Pre-registration store — Prisma-backed implementation (PR3).
 *
 * Replaces the in-memory store from PR2 (auth spike).
 * The public interface (function signatures) remains identical so that
 * auth-gate.ts pure functions require no changes.
 *
 * The store maps email → { tenantId, role } by querying the PreRegistration
 * table via Prisma. All lookups are normalized to lowercase.
 *
 * NOTE: addPreRegistration / removePreRegistration are called from MembersService
 * (in the backend) via Prisma transactions — not from the frontend. These
 * frontend-facing functions are kept as a compatibility shim for the auth hooks
 * but delegate to Prisma in production.
 *
 * The auth hooks (in auth.ts) call isEmailPreRegistered and lookupPreRegistrationByEmail.
 * Those functions query the shared Postgres DB via the same PrismaClient instance.
 */

import { PrismaClient } from '../../backend/generated/prisma/index.js';

export interface PreRegistrationEntry {
  tenantId: string;
  role: string;
}

// Shared Prisma client (singleton — same instance as auth.ts if bundled together)
const prisma = new PrismaClient();

/**
 * Returns true if the given email is pre-registered and active for the given tenant.
 * Used in session.create.before gate to re-validate on every sign-in.
 */
export async function isEmailPreRegistered(email: string, tenantId: string): Promise<boolean> {
  const entry = await prisma.preRegistration.findFirst({
    where: {
      email: email.toLowerCase(),
      tenantId,
      active: true,
    },
  });
  return entry !== null;
}

/**
 * Look up a pre-registration entry by email alone.
 * Used in user.create.before when tenantId is not yet known
 * (OAuth providers never provide tenantId).
 *
 * Returns null if the email is not pre-registered.
 */
export async function lookupPreRegistrationByEmail(
  email: string,
): Promise<PreRegistrationEntry | null> {
  const entry = await prisma.preRegistration.findFirst({
    where: {
      email: email.toLowerCase(),
      active: true,
    },
  });

  if (!entry) return null;

  return {
    tenantId: entry.tenantId,
    role: entry.role,
  };
}

/**
 * Add a pre-registration entry.
 * NOTE: In production this is called by MembersService (backend) via Prisma.
 * This function exists for test compatibility and manual seeding only.
 */
export async function addPreRegistration(
  email: string,
  tenantId: string,
  role = 'MEMBER',
): Promise<void> {
  await prisma.preRegistration.upsert({
    where: { tenantId_email: { tenantId, email: email.toLowerCase() } },
    update: { active: true, role: role as 'MEMBER' | 'ADMIN' },
    create: {
      email: email.toLowerCase(),
      tenantId,
      role: role as 'MEMBER' | 'ADMIN',
      active: true,
    },
  });
}

/**
 * Remove (deactivate) a pre-registration entry.
 * NOTE: In production this is called by MembersService (backend) via Prisma.
 */
export async function removePreRegistration(email: string, tenantId?: string): Promise<void> {
  if (tenantId) {
    await prisma.preRegistration.deleteMany({
      where: { email: email.toLowerCase(), tenantId },
    });
  } else {
    await prisma.preRegistration.deleteMany({
      where: { email: email.toLowerCase() },
    });
  }
}

/**
 * Clear all registrations — for test use only.
 * DANGEROUS: deletes all pre-registration records from the DB.
 */
export async function clearAllRegistrations(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('clearAllRegistrations() is only available in test environments');
  }
  await prisma.preRegistration.deleteMany({});
}

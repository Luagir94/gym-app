/**
 * Pre-registration store for the auth spike.
 *
 * NOTE: This is a temporary in-memory implementation for PR2 (auth spike).
 * PR3 (Prisma schema) will replace this with a real `PreRegistration` table
 * and the Better Auth hooks will query that table via Prisma instead.
 *
 * The store maps normalized email → { tenantId, role }.
 * (One email per tenant assumption — valid for the spike.)
 * An admin creates a member → addPreRegistration() is called.
 * A member is deactivated → removePreRegistration() is called.
 */

export interface PreRegistrationEntry {
  tenantId: string;
  role: string;
}

/**
 * Primary store: normalizedEmail → { tenantId, role }
 * Also used for isEmailPreRegistered(email, tenantId) lookups.
 */
const store = new Map<string, PreRegistrationEntry>();

function normalizeEmail(email: string): string {
  return email.toLowerCase();
}

export function isEmailPreRegistered(email: string, tenantId: string): boolean {
  const entry = store.get(normalizeEmail(email));
  return entry !== undefined && entry.tenantId === tenantId;
}

export function addPreRegistration(email: string, tenantId: string, role = 'MEMBER'): void {
  store.set(normalizeEmail(email), { tenantId, role });
}

export function removePreRegistration(email: string, _tenantId?: string): void {
  store.delete(normalizeEmail(email));
}

/**
 * Look up a pre-registration entry by email alone.
 * Used in user.create.before when tenantId is not yet known
 * (OAuth providers never provide tenantId).
 *
 * Returns null if the email is not pre-registered.
 */
export function lookupPreRegistrationByEmail(email: string): PreRegistrationEntry | null {
  return store.get(normalizeEmail(email)) ?? null;
}

/** Clear every pre-registration entry. Intended for use in test beforeEach. */
export function clearAllRegistrations(): void {
  store.clear();
}

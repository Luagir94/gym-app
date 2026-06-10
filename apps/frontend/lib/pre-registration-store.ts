/**
 * Pre-registration store for the auth spike.
 *
 * NOTE: This is a temporary in-memory implementation for PR2 (auth spike).
 * PR3 (Prisma schema) will replace this with a real `PreRegistration` table
 * and the Better Auth hooks will query that table via Prisma instead.
 *
 * The store maps `${tenantId}:${email}` → true.
 * An admin creates a member → addPreRegistration() is called.
 * A member is deactivated → removePreRegistration() is called.
 */

const store = new Set<string>();

function makeKey(email: string, tenantId: string): string {
  return `${tenantId}:${email.toLowerCase()}`;
}

export function isEmailPreRegistered(email: string, tenantId: string): boolean {
  return store.has(makeKey(email, tenantId));
}

export function addPreRegistration(email: string, tenantId: string): void {
  store.add(makeKey(email, tenantId));
}

export function removePreRegistration(email: string, tenantId: string): void {
  store.delete(makeKey(email, tenantId));
}

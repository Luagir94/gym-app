/**
 * Pure gate functions extracted from Better Auth database hooks.
 *
 * These functions implement the pre-registration enforcement logic
 * in a testable, framework-independent form. The Better Auth hooks
 * in auth.ts delegate directly to these functions.
 *
 * Fix 1a — user.create.before: look up email in pre-registration store,
 *           inject tenantId + role; reject if not found.
 * Fix 1b — session.create.before: re-validate on every sign-in that the
 *           user's email is still pre-registered/active.
 * Fix 2  — definePayload: throw instead of emitting tenantId: null.
 */

import {
  isEmailPreRegistered,
  lookupPreRegistrationByEmail,
} from './pre-registration-store';

export interface UserCreateInput {
  email: string;
  tenantId?: string | null;
  role?: string | null;
  [key: string]: unknown;
}

export interface GatedUserData extends UserCreateInput {
  tenantId: string;
  role: string;
}

/**
 * Gate for `databaseHooks.user.create.before`.
 *
 * Single source of truth for the pre-registration check: looks up the
 * entry BY EMAIL (normalized lowercase) — OAuth payloads never carry a
 * tenantId, so the store is the only place it can come from.
 * On match: returns the user data with tenantId and role injected.
 * On miss: throws so Better Auth blocks the user creation.
 */
export async function checkUserCreateGate(
  userData: UserCreateInput,
): Promise<GatedUserData> {
  const registration = await lookupPreRegistrationByEmail(userData.email);

  if (!registration) {
    throw new Error(
      `Email ${userData.email} is not pre-registered. Contact your gym administrator.`,
    );
  }

  return {
    ...userData,
    tenantId: registration.tenantId,
    role: registration.role ?? 'MEMBER',
  };
}

/**
 * Gate for `databaseHooks.session.create.before`.
 *
 * Re-validates on every sign-in that the user's email is still
 * pre-registered/active for their tenant. Returns false to block
 * session creation when a member has been deactivated — Better Auth
 * turns `return false` into a clean block (redirectOnError on the
 * OAuth callback path), whereas a thrown plain Error surfaces as a 500.
 *
 * @returns true when the session may be created, false to block it.
 */
export async function checkSessionCreateGate(
  email: string,
  tenantId: string | null | undefined,
): Promise<boolean> {
  if (!tenantId) {
    return false;
  }

  return isEmailPreRegistered(email.toLowerCase(), tenantId);
}

export interface DefinePayloadInput {
  tenantId: string | null | undefined;
  role: string | null | undefined;
}

export interface DefinePayloadResult {
  tenantId: string;
  role: string;
}

/**
 * Pure claims builder for Better Auth `definePayload`.
 *
 * Throws if tenantId is missing — never emits a null tenantId claim.
 * (Fix 2: NestJS validate() remains as defense-in-depth.)
 */
export function buildDefinePayload(input: DefinePayloadInput): DefinePayloadResult {
  if (!input.tenantId) {
    throw new Error('tenantId is required to issue a JWT — user record is incomplete');
  }

  return {
    tenantId: input.tenantId,
    role: input.role ?? 'MEMBER',
  };
}

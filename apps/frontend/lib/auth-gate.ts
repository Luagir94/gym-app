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

import { isEmailPreRegistered } from './pre-registration-store';

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
 * Looks up the pre-registration entry BY EMAIL (normalized lowercase).
 * On match: injects tenantId and role from the pre-registration arguments.
 * On miss: throws so Better Auth blocks the user creation.
 *
 * @param userData - The user data object as received from OAuth (no tenantId in OAuth payloads).
 * @param tenantId - The tenantId resolved from the pre-registration store lookup.
 * @param role     - The role resolved from the pre-registration store lookup.
 * @returns The user data object with tenantId and role injected.
 */
export async function checkUserCreateGate(
  userData: UserCreateInput,
  tenantId: string | null | undefined,
  role: string | null | undefined,
): Promise<GatedUserData> {
  const email = userData.email.toLowerCase();

  if (!tenantId || !isEmailPreRegistered(email, tenantId)) {
    throw new Error(
      `Email ${userData.email} is not pre-registered. Contact your gym administrator.`,
    );
  }

  return {
    ...userData,
    tenantId,
    role: role ?? 'MEMBER',
  };
}

/**
 * Gate for `databaseHooks.session.create.before`.
 *
 * Re-validates on every sign-in that the user's email is still
 * pre-registered/active for their tenant. Blocks session creation
 * when a member has been deactivated (their entry removed from the store).
 *
 * @param email    - The user's email address.
 * @param tenantId - The user's tenantId from the stored user record.
 */
export async function checkSessionCreateGate(
  email: string,
  tenantId: string | null | undefined,
): Promise<void> {
  if (!tenantId) {
    throw new Error('No tenant context for session creation');
  }

  if (!isEmailPreRegistered(email.toLowerCase(), tenantId)) {
    throw new Error(
      `Email ${email} is not pre-registered. Access revoked.`,
    );
  }
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

import { betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { checkUserCreateGate, checkSessionCreateGate, buildDefinePayload } from './auth-gate';

/**
 * Better Auth instance for gym-app.
 *
 * SPIKE FINDING (2026-06-10):
 * - Better Auth 1.6.15 JWT plugin: `definePayload` IS the correct API.
 * - The function receives `{ user, session }` and returns additional JWT claims.
 * - Claims `tenantId` and `role` are confirmed to be included in issued JWTs.
 * - JWKS endpoint: GET /api/auth/jwks (default path, configurable via jwksPath)
 * - Token endpoint: GET /api/auth/token (returns { token: string })
 * - JWT default signing alg: EdDSA (verified in sign.mjs / key alg field)
 * - JWT default iss/aud: baseURL origin (verified in sign.mjs lines 16-20)
 *
 * ADAPTER NOTE (PR2 spike):
 * Using memory adapter for the spike. PR3 will replace this with:
 *   import { PrismaClient } from '@prisma/client';
 *   import { prismaAdapter } from 'better-auth/adapters/prisma';
 *   database: prismaAdapter(prisma, { provider: 'postgresql' })
 *
 * GATE DESIGN (PR2):
 * - user.create.before: looks up email in pre-registration store, injects tenantId/role.
 *   Google OAuth payloads never carry tenantId — the gate MUST derive it by email lookup.
 * - session.create.before: re-validates on every sign-in that the user is still active.
 *   Without this hook, deactivating a member has no effect on returning logins.
 */

// Fail fast at runtime — do not allow a weak or missing secret.
// Skip during Next.js static build phase (no real requests served yet).
const secret = process.env.BETTER_AUTH_SECRET;
if (process.env.NEXT_PHASE !== 'phase-production-build' && (!secret || secret.length < 32)) {
  throw new Error(
    'BETTER_AUTH_SECRET is missing or shorter than 32 characters. ' +
    'Generate one with: openssl rand -base64 32',
  );
}

// In-memory DB for Better Auth (spike only)
const db: Record<string, any[]> = {};

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  // During build phase secret is undefined; betterAuth will not be called for real requests.
  secret: secret ?? 'build-phase-placeholder-not-used-at-runtime',

  database: memoryAdapter(db),

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },

  plugins: [
    jwt({
      jwt: {
        expirationTime: '15m',
        /**
         * definePayload: Fix 2 — throws instead of emitting tenantId: null.
         *
         * The user record at this point has tenantId/role already injected by the
         * user.create.before gate. If tenantId is somehow absent, we must NOT issue
         * a JWT with a null claim — throw to block token issuance entirely.
         *
         * Verified: Better Auth sign.mjs sets iss and aud to baseURL origin by default
         * (lines 16-20). NestJS JwtStrategy validates against the same value.
         */
        definePayload: ({ user }: { user: Record<string, unknown> }) => {
          const typed = user as { tenantId?: string | null; role?: string | null };
          return buildDefinePayload({ tenantId: typed.tenantId, role: typed.role });
        },
      },
    }),
  ],

  /**
   * Additional fields on the User model (needed for tenantId and role).
   * In PR3 these become real Prisma columns. For the spike, they are
   * stored as extra fields in the memory adapter.
   */
  user: {
    additionalFields: {
      tenantId: {
        type: 'string',
        required: false,
        defaultValue: null,
      },
      role: {
        type: 'string',
        required: false,
        defaultValue: 'MEMBER',
      },
    },
  },

  /**
   * Pre-registration gates.
   *
   * Fix 1a — user.create.before:
   *   Google OAuth never provides tenantId. We look up the pre-registration entry
   *   BY EMAIL (normalized lowercase). If found, we inject tenantId and role from
   *   the store into the user data being created. If not found, we reject.
   *
   * Fix 1b — session.create.before:
   *   Re-validate on every sign-in that the user's email is still active.
   *   The hook receives the session record and the endpoint context.
   *   We resolve the user via context.internalAdapter.findUserById(session.userId).
   *   If the user's email is no longer pre-registered (deactivated), we block
   *   session creation by returning false.
   *
   * Hook API verified against @better-auth/core dist/types/init-options.d.mts:
   *   user.create.before: (user, ctx) => Promise<boolean | void | { data: ... }>
   *   session.create.before: (session, ctx) => Promise<boolean | void | { data: ... }>
   *   Returning false blocks the operation.
   *   Throwing also blocks the operation and surfaces the error.
   */
  databaseHooks: {
    user: {
      create: {
        before: async (
          newUser: { email: string; tenantId?: string | null; role?: string | null } & Record<string, unknown>,
        ) => {
          // Resolve tenantId/role from the pre-registration store by email lookup.
          // We derive these from the store — OAuth providers never send tenantId.
          // The store key is `${tenantId}:${email.toLowerCase()}`.
          // Because we don't yet have a Prisma DB (PR3), we use a simple lookup
          // that requires the admin to have called addPreRegistration(email, tenantId).
          // At this point we need the tenantId context — which won't come from the
          // OAuth payload. In PR3 we query: SELECT tenantId FROM PreRegistration WHERE email=?
          // For the spike: the pre-registration store is keyed by tenantId+email, so we
          // need a way to look up by email alone. We expose a helper from the store.
          const { lookupPreRegistrationByEmail } = await import('./pre-registration-store');
          const registration = lookupPreRegistrationByEmail(newUser.email);

          if (!registration) {
            throw new Error(
              `Email ${newUser.email} is not pre-registered. Contact your gym administrator.`,
            );
          }

          const gated = await checkUserCreateGate(
            newUser,
            registration.tenantId,
            registration.role ?? 'MEMBER',
          );

          return { data: gated };
        },
      },
    },
    session: {
      create: {
        /**
         * Fix 1b: Re-validate on every sign-in.
         *
         * Hook signature (verified in @better-auth/core init-options.d.mts):
         *   before?: (session: Session & Record<string, unknown>, context: GenericEndpointContext | null)
         *            => Promise<boolean | void | { data: ... }>
         *
         * The session record contains `userId`. We resolve the user via
         * context.internalAdapter.findUserById() and check their email.
         * context may be null in some internal flows — if null, we allow
         * the session (can only happen in server-side flows, not OAuth).
         */
        before: async (
          session: { userId: string } & Record<string, unknown>,
          context: {
            context: {
              internalAdapter: {
                findUserById: (id: string) => Promise<{ email: string; tenantId?: string | null } | null>;
              };
            };
          } | null,
        ) => {
          if (!context) {
            // Defensive: context is null in some internal adapter flows.
            // Cannot validate — allow through and let the JWT claims guard handle it.
            return;
          }

          const user = await context.context.internalAdapter.findUserById(session.userId);

          if (!user) {
            // User record gone — block session creation.
            return false;
          }

          await checkSessionCreateGate(user.email, user.tenantId);

          // Return void (undefined) to allow session creation with original data.
        },
      },
    },
  },
});

export type Auth = typeof auth;

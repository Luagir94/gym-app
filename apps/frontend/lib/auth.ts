import { betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { isEmailPreRegistered } from './pre-registration-store';

/**
 * Better Auth instance for gym-app.
 *
 * SPIKE FINDING (2026-06-10):
 * - Better Auth 1.6.15 JWT plugin: `definePayload` IS the correct API.
 * - The function receives `{ user, session }` and returns custom claims
 *   that are merged into the JWT alongside `sub` (set via `getSubject`).
 * - Claims `tenantId` and `role` are confirmed to be included in issued JWTs.
 * - JWKS endpoint: GET /api/auth/jwks (default path, configurable via jwksPath)
 * - Token endpoint: GET /api/auth/token (returns { token: string })
 *
 * ADAPTER NOTE (PR2 spike):
 * Using memory adapter for the spike. PR3 will replace this with:
 *   import { PrismaClient } from '@prisma/client';
 *   import { prismaAdapter } from 'better-auth/adapters/prisma';
 *   database: prismaAdapter(prisma, { provider: 'postgresql' })
 *
 * TENANCY NOTE (PR2):
 * tenantId is read from the user record. In PR3, the User model will carry
 * a `tenantId` field populated at registration time. For the spike, the
 * memory adapter stores user records with a `tenantId` field via additionalFields.
 */

// In-memory DB for Better Auth (spike only)
const db: Record<string, any[]> = {};

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-replace-in-production',

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
         * SPIKE VERIFICATION: definePayload is the correct API in Better Auth 1.6.15.
         * It receives { user, session } and returns additional JWT claims.
         * The JWT will contain: sub (userId), tenantId, role — plus standard JWT fields.
         */
        definePayload: ({ user }) => ({
          tenantId: (user as any).tenantId ?? null,
          role: (user as any).role ?? 'MEMBER',
        }),
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
   * Pre-registration gate.
   * Block sign-in if the email is not in the pre-registration store.
   *
   * Note: `databaseHooks.user.create.before` fires before a NEW user record is written.
   * `hooks.signIn.after` (or a custom hook) handles returning sessions.
   * For the spike, the cleanest gating point is `user.create.before`.
   */
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          const user = newUser as any;
          const tenantId: string | undefined = user.tenantId;
          const email: string = user.email;

          if (!tenantId) {
            // No tenant context at user creation → reject
            throw new Error('No tenant context for user creation');
          }

          if (!isEmailPreRegistered(email, tenantId)) {
            throw new Error(
              `Email ${email} is not pre-registered for tenant ${tenantId}. Contact your gym administrator.`,
            );
          }

          return { data: newUser };
        },
      },
    },
  },
});

export type Auth = typeof auth;

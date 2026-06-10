import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

/**
 * Better Auth catch-all route handler.
 *
 * Handles all auth endpoints:
 *   GET  /api/auth/jwks         → JWKS public keys (consumed by NestJS JwtStrategy)
 *   GET  /api/auth/token        → Issues a signed JWT for the current session
 *   POST /api/auth/sign-in/social → Google OAuth initiation
 *   POST /api/auth/callback/google → Google OAuth callback
 *   ... and all other Better Auth endpoints
 *
 * The JWT plugin automatically exposes /api/auth/jwks and /api/auth/token
 * when the jwt() plugin is registered in auth.ts.
 */
const handler = toNextJsHandler(auth);

export const { GET, POST } = handler;

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt, StrategyOptionsWithoutRequest } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import type { Algorithm } from 'jsonwebtoken';

export interface JwtPayload {
  sub: string;
  tenantId?: string;
  role?: string;
  [key: string]: unknown;
}

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    /**
     * Fix 4 — Unified issuer env var: BETTER_AUTH_URL (not NEXT_URL).
     * Better Auth sets iss and aud to the baseURL origin by default.
     * Verified in better-auth/dist/plugins/jwt/sign.mjs lines 16-20:
     *   const baseURLOrigin = typeof ctx.context.options.baseURL === "string"
     *     ? ctx.context.options.baseURL : "";
     *   const defaultIss = options?.jwt?.issuer ?? baseURLOrigin;
     *   const defaultAud = options?.jwt?.audience ?? baseURLOrigin;
     *
     * Fix 6 — Narrow algorithms to ['EdDSA'] only.
     * Better Auth JWT plugin signs with EdDSA by default.
     * Verified in sign.mjs line 40:
     *   const alg = key.alg ?? options?.jwks?.keyPairConfig?.alg ?? "EdDSA";
     *
     * Fix 3 — Add audience validation matching the issuer (same baseURL origin).
     */
    const betterAuthUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

    const options: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${betterAuthUrl}/api/auth/jwks`,
      }),
      issuer: betterAuthUrl,
      audience: betterAuthUrl,
      // EdDSA is Better Auth's default signing algorithm (verified in sign.mjs:40).
      // @types/jsonwebtoken does not include EdDSA in its Algorithm union (as of 9.x),
      // so we use a double cast. The runtime value is correct — passport-jwt forwards
      // this string directly to jose which accepts EdDSA.
      algorithms: ['EdDSA'] as unknown as Algorithm[],
    };

    super(options);
  }

  /**
   * Called after passport-jwt validates the JWT signature via JWKS.
   * Returns the user object attached to request.user, or undefined to reject.
   *
   * Fix 9: Reject when sub is missing or empty string (no valid subject claim).
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser | undefined> {
    if (!payload.sub || !payload.tenantId || !payload.role) {
      return undefined;
    }

    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    };
  }
}

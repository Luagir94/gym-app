import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt, StrategyOptionsWithoutRequest } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

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
    const nextUrl = process.env.NEXT_URL ?? 'http://localhost:3000';

    const options: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${nextUrl}/api/auth/jwks`,
      }),
      issuer: nextUrl,
      algorithms: ['EdDSA', 'RS256', 'ES256'],
    };

    super(options);
  }

  /**
   * Called after passport-jwt validates the JWT signature via JWKS.
   * Returns the user object attached to request.user, or undefined to reject.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser | undefined> {
    if (!payload.tenantId || !payload.role) {
      return undefined;
    }

    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    };
  }
}

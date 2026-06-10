import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that validates the JWT Bearer token in the Authorization header.
 * Uses the 'jwt' strategy registered by JwtStrategy.
 * Returns 401 if the token is absent, expired, or has an invalid signature.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

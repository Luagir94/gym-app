// Mock passport-jwt and jwks-rsa since they involve network/crypto setup.
// We capture constructor options to assert configuration, and test validate() logic.
let capturedStrategyOptions: unknown;
let capturedJwksOptions: unknown;

jest.mock('passport-jwt', () => {
  const actual = jest.requireActual('passport-jwt');
  return {
    ...actual,
    Strategy: class MockStrategy {},
    ExtractJwt: {
      fromAuthHeaderAsBearerToken: jest.fn(() => jest.fn()),
    },
  };
});

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn((opts: unknown) => {
    capturedJwksOptions = opts;
    return 'mock-secret-provider';
  }),
}));

// PassportStrategy(Strategy, name) returns a base class whose constructor
// receives the options passed to super() in JwtStrategy.
jest.mock('@nestjs/passport', () => ({
  PassportStrategy: (_Strategy: unknown, _name: unknown) =>
    class Base {
      constructor(options: unknown) {
        capturedStrategyOptions = options;
      }
    },
}));

import { JwtStrategy } from './jwt.strategy';

const BASE_URL = 'http://localhost:3000';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    capturedStrategyOptions = undefined;
    capturedJwksOptions = undefined;
    process.env.BETTER_AUTH_URL = BASE_URL;
    delete process.env.NEXT_URL;
    strategy = new JwtStrategy();
  });

  describe('constructor — strategy options', () => {
    it('uses only EdDSA algorithm (no RS256 or ES256)', () => {
      const opts = capturedStrategyOptions as { algorithms: string[] };
      expect(opts.algorithms).toEqual(['EdDSA']);
    });

    it('sets issuer to BETTER_AUTH_URL', () => {
      const opts = capturedStrategyOptions as { issuer: string };
      expect(opts.issuer).toBe(BASE_URL);
    });

    it('sets audience to BETTER_AUTH_URL', () => {
      const opts = capturedStrategyOptions as { audience: string };
      expect(opts.audience).toBe(BASE_URL);
    });

    it('points jwksUri at /api/auth/jwks on BETTER_AUTH_URL', () => {
      const jwks = capturedJwksOptions as { jwksUri: string };
      expect(jwks.jwksUri).toBe(`${BASE_URL}/api/auth/jwks`);
    });
  });

  describe('validate()', () => {
    it('extracts userId, tenantId, and role from a valid ADMIN payload', async () => {
      const payload = {
        sub: 'user-123',
        tenantId: 'tenant-abc',
        role: 'ADMIN',
      };

      const result = await strategy.validate(payload);

      expect(result).toBeDefined();
      expect(result!.userId).toBe('user-123');
      expect(result!.tenantId).toBe('tenant-abc');
      expect(result!.role).toBe('ADMIN');
    });

    it('extracts userId, tenantId, and role from a valid MEMBER payload', async () => {
      const payload = {
        sub: 'user-456',
        tenantId: 'tenant-xyz',
        role: 'MEMBER',
      };

      const result = await strategy.validate(payload);

      expect(result).toBeDefined();
      expect(result!.userId).toBe('user-456');
      expect(result!.tenantId).toBe('tenant-xyz');
      expect(result!.role).toBe('MEMBER');
    });

    it('returns undefined when tenantId is missing (tampered/incomplete token)', async () => {
      const payload = {
        sub: 'user-789',
        role: 'ADMIN',
        // tenantId intentionally absent — simulates a tampered payload
      };

      const result = await strategy.validate(payload);

      // undefined return causes Passport to reject with 401
      expect(result).toBeUndefined();
    });

    it('returns undefined when role is missing', async () => {
      const payload = {
        sub: 'user-999',
        tenantId: 'tenant-abc',
        // role intentionally absent
      };

      const result = await strategy.validate(payload);

      expect(result).toBeUndefined();
    });

    it('returns undefined when sub is missing (no subject claim)', async () => {
      const payload = {
        // sub intentionally absent
        tenantId: 'tenant-abc',
        role: 'MEMBER',
      };

      const result = await strategy.validate(payload as { sub: string; tenantId: string; role: string });

      expect(result).toBeUndefined();
    });

    it('returns undefined when sub is empty string', async () => {
      const payload = {
        sub: '',
        tenantId: 'tenant-abc',
        role: 'MEMBER',
      };

      const result = await strategy.validate(payload);

      expect(result).toBeUndefined();
    });
  });
});

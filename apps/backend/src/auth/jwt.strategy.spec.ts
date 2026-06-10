// Mock passport-jwt and jwks-rsa since they involve network/crypto setup.
// We test only the validate() business logic which is pure and deterministic.
jest.mock('passport-jwt', () => {
  const actual = jest.requireActual('passport-jwt');
  return {
    ...actual,
    Strategy: class MockStrategy {
      constructor(_options: unknown) {}
    },
    ExtractJwt: {
      fromAuthHeaderAsBearerToken: jest.fn(() => jest.fn()),
    },
  };
});
jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(),
}));
jest.mock('@nestjs/passport', () => ({
  PassportStrategy: (_Strategy: unknown, _name: unknown) =>
    class Base {
      constructor() {}
    },
}));

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    process.env.NEXT_URL = 'http://localhost:3000';
    strategy = new JwtStrategy();
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
  });
});

/**
 * TenantPrismaService — unit tests (TDD RED → GREEN)
 *
 * Tests verify the tenant-isolation contract:
 * 1. runWithTenant() sets AsyncLocalStorage context and exposes it via getTenantId()
 * 2. requireTenantId() throws when no context is set
 * 3. runWithTenant() isolates context across concurrent calls
 *
 * Note: PrismaClient constructor is mocked to avoid needing a real DB connection
 * for unit tests. The ALS logic is pure Node.js and needs no DB.
 */

// Mock PrismaClient before importing the service
jest.mock('../../generated/prisma/index.js', () => {
  return {
    PrismaClient: class MockPrismaClient {
      $connect = jest.fn().mockResolvedValue(undefined);
      $disconnect = jest.fn().mockResolvedValue(undefined);
      $extends = jest.fn().mockReturnThis();
    },
  };
});

import { TenantPrismaService } from './tenant-prisma.service';

describe('TenantPrismaService', () => {
  let service: TenantPrismaService;

  beforeEach(() => {
    service = new TenantPrismaService();
  });

  describe('getTenantId()', () => {
    it('returns undefined when no tenant context is active', () => {
      expect(service.getTenantId()).toBeUndefined();
    });

    it('returns the tenantId set by runWithTenant()', async () => {
      let captured: string | undefined;

      await service.runWithTenant('tenant-abc', async () => {
        captured = service.getTenantId();
      });

      expect(captured).toBe('tenant-abc');
    });

    it('returns undefined again after runWithTenant() exits (context is scoped)', async () => {
      await service.runWithTenant('tenant-xyz', async () => {
        // inside context
      });

      // outside context — should be cleared
      expect(service.getTenantId()).toBeUndefined();
    });
  });

  describe('requireTenantId()', () => {
    it('throws when no tenant context is active', () => {
      expect(() => service.requireTenantId()).toThrow(
        'No tenant context active — request must pass through TenantContextInterceptor',
      );
    });

    it('returns the tenantId when context is active', async () => {
      let result: string | undefined;

      await service.runWithTenant('tenant-123', async () => {
        result = service.requireTenantId();
      });

      expect(result).toBe('tenant-123');
    });
  });

  describe('runWithTenant() isolation', () => {
    it('isolates concurrent tenant contexts via AsyncLocalStorage', async () => {
      const results: string[] = [];

      // Simulate two concurrent requests with different tenantIds
      await Promise.all([
        service.runWithTenant('tenant-A', async () => {
          // yield to allow the other coroutine to run
          await new Promise<void>((resolve) => setImmediate(resolve));
          results.push(service.getTenantId() as string);
        }),
        service.runWithTenant('tenant-B', async () => {
          await new Promise<void>((resolve) => setImmediate(resolve));
          results.push(service.getTenantId() as string);
        }),
      ]);

      // Both tenantIds should appear exactly once, no cross-contamination
      expect(results).toHaveLength(2);
      expect(results).toContain('tenant-A');
      expect(results).toContain('tenant-B');
    });
  });
});

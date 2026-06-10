import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '../../generated/prisma/index.js';

/**
 * Request-scoped tenant isolation via AsyncLocalStorage.
 *
 * Design decision (from spec):
 * - Prisma client extensions are immutable — a new extended client is created
 *   per request. The tenant context MUST flow through AsyncLocalStorage, NOT
 *   via mutable service properties (which would cause cross-request contamination).
 *
 * Usage:
 *   // In the interceptor (once per request):
 *   await tenantService.runWithTenant(tenantId, () => next.handle().toPromise());
 *
 *   // In any service:
 *   const db = tenantService.getClient(); // pre-scoped to current tenant
 */
@Injectable()
export class TenantPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly als = new AsyncLocalStorage<string>();

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Run an async callback with a tenant context set in AsyncLocalStorage.
   * All calls to getTenantId() / requireTenantId() within the callback
   * (and any async operations they await) will see this tenantId.
   */
  runWithTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.als.run(tenantId, fn);
  }

  /**
   * Returns the current tenant ID from AsyncLocalStorage, or undefined if
   * no tenant context is active (e.g., called outside a request lifecycle).
   */
  getTenantId(): string | undefined {
    return this.als.getStore();
  }

  /**
   * Returns the current tenant ID, throwing if none is set.
   * Use this in services that must always be called within a tenant context.
   */
  requireTenantId(): string {
    const tenantId = this.als.getStore();
    if (!tenantId) {
      throw new Error(
        'No tenant context active — request must pass through TenantContextInterceptor',
      );
    }
    return tenantId;
  }

  /**
   * Returns a Prisma client pre-scoped to the current tenant.
   * All model operations on the returned client automatically filter by tenantId.
   *
   * Internally uses $extends with a query extension to inject
   * WHERE tenantId = currentTenantId on all findMany/findFirst/count operations,
   * and sets tenantId on create/createMany operations.
   *
   * IMPORTANT: Prisma extensions are immutable — a new client is returned
   * per call. The extension reads tenantId from AsyncLocalStorage at query time.
   */
  getClient() {
    const tenantId = this.requireTenantId();

    return this.$extends({
      query: {
        // Apply tenant filter to all tenant-scoped models
        user: buildTenantQueryExtension(tenantId),
        activity: buildTenantQueryExtension(tenantId),
        exercise: buildTenantQueryExtension(tenantId),
        routine: buildTenantQueryExtension(tenantId),
        payment: buildTenantQueryExtension(tenantId),
        preRegistration: buildTenantQueryExtension(tenantId),
      },
    });
  }
}

/**
 * Builds a Prisma query extension for a tenant-scoped model.
 * Injects tenantId into find operations (where clause) and create operations (data).
 *
 * Pure function — no side effects, easily testable.
 */
function buildTenantQueryExtension(tenantId: string) {
  return {
    async findMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
      args.where = { ...args.where, tenantId };
      return query(args);
    },
    async findFirst({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
      args.where = { ...args.where, tenantId };
      return query(args);
    },
    async count({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
      args.where = { ...args.where, tenantId };
      return query(args);
    },
    async create({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
      args.data = { ...args.data, tenantId };
      return query(args);
    },
    async createMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
      if (Array.isArray(args.data)) {
        args.data = args.data.map((item: any) => ({ ...item, tenantId }));
      } else {
        args.data = { ...args.data, tenantId };
      }
      return query(args);
    },
  };
}

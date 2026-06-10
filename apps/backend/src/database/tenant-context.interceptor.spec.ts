/**
 * TenantContextInterceptor — unit tests (TDD RED → GREEN)
 *
 * Tests verify:
 * 1. Extracts tenantId from request.user and sets it in TenantPrismaService
 * 2. Returns HTTP 400 when tenantId is missing from JWT claims
 * 3. Calls next.handle() when tenantId is present
 */

import { BadRequestException } from '@nestjs/common';
import { TenantContextInterceptor } from './tenant-context.interceptor';

describe('TenantContextInterceptor', () => {
  let interceptor: TenantContextInterceptor;
  let mockTenantService: { runWithTenant: jest.Mock };

  beforeEach(() => {
    mockTenantService = {
      runWithTenant: jest.fn().mockImplementation(async (_tenantId: string, fn: () => Promise<void>) => fn()),
    };
    interceptor = new TenantContextInterceptor(mockTenantService as any);
  });

  it('calls runWithTenant with the JWT tenantId and passes through', async () => {
    const { Observable } = await import('rxjs');
    const mockRequest = { user: { tenantId: 'tenant-A', userId: 'user-1', role: 'ADMIN' } };
    const mockObservable = new Observable((sub) => { sub.next('data'); sub.complete(); });
    const mockNext = { handle: jest.fn().mockReturnValue(mockObservable) };
    const mockContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    };

    const result$ = interceptor.intercept(mockContext as any, mockNext as any);

    // Subscribe to trigger the Observable constructor (where runWithTenant is called)
    await new Promise<void>((resolve, reject) => {
      result$.subscribe({ next: () => {}, error: reject, complete: resolve });
    });

    // The interceptor wraps next.handle() inside runWithTenant
    expect(mockTenantService.runWithTenant).toHaveBeenCalledWith(
      'tenant-A',
      expect.any(Function),
    );
  });

  it('throws BadRequestException when tenantId is missing from JWT', () => {
    const mockRequest = { user: { userId: 'user-1', role: 'ADMIN' } }; // no tenantId
    const mockNext = { handle: jest.fn() };
    const mockContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    };

    expect(() =>
      interceptor.intercept(mockContext as any, mockNext as any),
    ).toThrow(BadRequestException);

    expect(mockNext.handle).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when user is not present on request', () => {
    const mockRequest = {}; // no user at all
    const mockNext = { handle: jest.fn() };
    const mockContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    };

    expect(() =>
      interceptor.intercept(mockContext as any, mockNext as any),
    ).toThrow(BadRequestException);
  });
});

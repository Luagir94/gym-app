import { Global, Module } from '@nestjs/common';
import { TenantPrismaService } from './tenant-prisma.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';

/**
 * DatabaseModule — provides TenantPrismaService globally.
 *
 * Marked @Global so TenantPrismaService can be injected in any module
 * without needing to re-import DatabaseModule everywhere.
 */
@Global()
@Module({
  providers: [TenantPrismaService, TenantContextInterceptor],
  exports: [TenantPrismaService, TenantContextInterceptor],
})
export class DatabaseModule {}

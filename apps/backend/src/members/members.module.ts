import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

/**
 * MembersModule — member CRUD + pre-registration management.
 *
 * TenantPrismaService is injected via the global DatabaseModule
 * (no need to import it here).
 */
@Module({
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}

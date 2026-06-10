import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantContextInterceptor } from '../database/tenant-context.interceptor';
import { MembersService } from './members.service';
import { CreateMemberDtoSchema } from '@gym/shared';
import type { CreateMemberDto } from '@gym/shared';

/**
 * MembersController — admin-only member management endpoints.
 *
 * All routes require:
 * - Valid JWT (JwtAuthGuard)
 * - ADMIN role (RolesGuard + @Roles)
 * - Active tenant context (TenantContextInterceptor)
 */
@Controller('api/v1/members')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('ADMIN')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post()
  create(@Body() body: CreateMemberDto) {
    const dto = CreateMemberDtoSchema.parse(body);
    return this.membersService.createMember(dto);
  }

  @Get()
  list() {
    return this.membersService.listMembers();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.membersService.getMember(id);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.membersService.deactivateMember(id);
  }
}

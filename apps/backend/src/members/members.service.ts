import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import type { CreateMemberDto } from '@gym/shared';

/**
 * MembersService — domain logic for member management.
 *
 * All DB queries go through TenantPrismaService.getClient() which
 * auto-injects tenantId from AsyncLocalStorage. No manual tenantId
 * is needed in query parameters.
 *
 * Spec compliance:
 * - createMember: creates User + PreRegistration atomically
 * - deactivateMember: sets INACTIVE + deletes PreRegistration (prevents login)
 * - listMembers: tenant-scoped list
 * - getMember: tenant-scoped single lookup
 */
@Injectable()
export class MembersService {
  constructor(private readonly db: TenantPrismaService) {}

  /**
   * Creates a new member (ACTIVE status) and a pre-registration entry
   * so the member can sign in via Google OAuth.
   *
   * Throws ConflictException if the email already exists in this tenant.
   */
  async createMember(dto: CreateMemberDto) {
    const client = this.db.getClient();

    // Check for duplicate email in this tenant (enforced by tenant-scoped client)
    const existing = await client.user.findFirst({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException(
        `Member with email ${dto.email} already exists in this tenant`,
      );
    }

    // Create member + pre-registration atomically
    return this.db.$transaction(async (tx) => {
      const member = await tx.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          role: 'MEMBER',
          status: 'ACTIVE',
          tenantId: this.db.requireTenantId(),
        },
      });

      await tx.preRegistration.create({
        data: {
          email: dto.email,
          tenantId: this.db.requireTenantId(),
          role: 'MEMBER',
          active: true,
        },
      });

      return member;
    });
  }

  /**
   * Deactivates a member (INACTIVE status) and removes their pre-registration
   * so they can no longer sign in via Google OAuth.
   *
   * Historical data (payments, routines, activities) is preserved.
   */
  async deactivateMember(memberId: string) {
    const client = this.db.getClient();

    const member = await client.user.findFirst({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException(`Member ${memberId} not found in this tenant`);
    }

    return this.db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: memberId },
        data: { status: 'INACTIVE' },
      });

      // Remove pre-registration so the member cannot log in again
      await tx.preRegistration.deleteMany({
        where: {
          email: member.email,
          tenantId: this.db.requireTenantId(),
        },
      });

      return updated;
    });
  }

  /**
   * Returns all members in the current tenant (any status).
   */
  async listMembers() {
    const client = this.db.getClient();
    return client.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns a single member by ID within the current tenant.
   * Throws NotFoundException if not found.
   */
  async getMember(memberId: string) {
    const client = this.db.getClient();

    const member = await client.user.findFirst({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException(`Member ${memberId} not found in this tenant`);
    }

    return member;
  }
}

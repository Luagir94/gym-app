/**
 * MembersService — unit tests (TDD RED → GREEN)
 *
 * Mocks TenantPrismaService to test member CRUD logic in isolation.
 * Tests cover:
 * 1. createMember — creates member + pre-registration atomically
 * 2. createMember — duplicate email throws ConflictException
 * 3. deactivateMember — sets status INACTIVE and removes pre-registration
 * 4. listMembers — returns all members for current tenant
 * 5. getMember — returns single member or throws NotFoundException
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { MembersService } from './members.service';

// Minimal Prisma mock shape that matches what MembersService needs
const mockMember = {
  id: 'member-1',
  tenantId: 'tenant-A',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'MEMBER',
  status: 'ACTIVE',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// The mock DB client returned by getClient()
const mockClientOperations = {
  user: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  preRegistration: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
};

// TenantPrismaService mock — includes getClient(), requireTenantId(), $transaction()
const mockDb = {
  ...mockClientOperations,
  getClient: jest.fn().mockReturnValue(mockClientOperations),
  requireTenantId: jest.fn().mockReturnValue('tenant-A'),
  $transaction: jest.fn(),
};

describe('MembersService', () => {
  let service: MembersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MembersService(mockDb as any);
  });

  describe('createMember()', () => {
    it('creates a member and pre-registration entry successfully', async () => {
      mockDb.user.findFirst.mockResolvedValue(null); // no duplicate
      mockDb.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        // Execute the transaction function with the mock
        return fn(mockDb);
      });
      mockDb.user.create.mockResolvedValue(mockMember);
      mockDb.preRegistration.create.mockResolvedValue({
        id: 'pre-1',
        email: 'alice@example.com',
        tenantId: 'tenant-A',
        role: 'MEMBER',
        active: true,
      });

      const result = await service.createMember({
        email: 'alice@example.com',
        name: 'Alice',
      });

      expect(result.email).toBe('alice@example.com');
      expect(result.status).toBe('ACTIVE');
      expect(mockDb.user.create).toHaveBeenCalledTimes(1);
      expect(mockDb.preRegistration.create).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when email already exists in tenant', async () => {
      mockDb.user.findFirst.mockResolvedValue(mockMember); // duplicate found

      await expect(
        service.createMember({ email: 'alice@example.com', name: 'Alice Again' }),
      ).rejects.toThrow(ConflictException);

      expect(mockDb.user.create).not.toHaveBeenCalled();
    });
  });

  describe('deactivateMember()', () => {
    it('sets status to INACTIVE and removes pre-registration', async () => {
      mockDb.user.findFirst.mockResolvedValue(mockMember);
      const deactivatedMember = { ...mockMember, status: 'INACTIVE' };
      mockDb.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(mockDb));
      mockDb.user.update.mockResolvedValue(deactivatedMember);
      mockDb.preRegistration.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deactivateMember('member-1');

      expect(result.status).toBe('INACTIVE');
      expect(mockDb.preRegistration.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when member does not exist', async () => {
      mockDb.user.findFirst.mockResolvedValue(null);

      await expect(service.deactivateMember('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listMembers()', () => {
    it('returns all members for the current tenant', async () => {
      const members = [mockMember, { ...mockMember, id: 'member-2', email: 'bob@example.com' }];
      mockDb.user.findMany.mockResolvedValue(members);

      const result = await service.listMembers();

      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('alice@example.com');
    });

    it('returns empty array when tenant has no members', async () => {
      mockDb.user.findMany.mockResolvedValue([]);

      const result = await service.listMembers();

      expect(result).toHaveLength(0);
    });
  });

  describe('getMember()', () => {
    it('returns the member when it exists', async () => {
      mockDb.user.findFirst.mockResolvedValue(mockMember);

      const result = await service.getMember('member-1');

      expect(result.id).toBe('member-1');
      expect(result.email).toBe('alice@example.com');
    });

    it('throws NotFoundException when member does not exist', async () => {
      mockDb.user.findFirst.mockResolvedValue(null);

      await expect(service.getMember('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });
});

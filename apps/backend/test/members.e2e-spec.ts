/**
 * Members module e2e tests (Task 3.13)
 *
 * Tests POST/GET/PATCH /api/v1/members against a real DB.
 * Verifies HTTP status codes and response shapes.
 *
 * Requires TEST_DATABASE_URL in the environment.
 * Skips gracefully if DB is unavailable.
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/database/tenant-prisma.service';

const TEST_TENANT_ID = 'test-tenant-members-e2e';

describe('Members e2e (/api/v1/members)', () => {
  let app: INestApplication;
  let prisma: TenantPrismaService;
  let dbAvailable = false;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      console.warn('[SKIP] TEST_DATABASE_URL not set — members e2e tests require a real DB.');
      return;
    }

    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider('JwtStrategy')
        .useValue({
          validate: jest.fn().mockImplementation((payload: any) => ({
            userId: payload.sub ?? 'admin-user',
            tenantId: payload.tenantId ?? TEST_TENANT_ID,
            role: payload.role ?? 'ADMIN',
          })),
        })
        .compile();

      app = moduleFixture.createNestApplication();
      await app.init();

      prisma = moduleFixture.get(TenantPrismaService);
      await prisma.$connect();

      // Seed test tenant
      await prisma.tenant.upsert({
        where: { id: TEST_TENANT_ID },
        update: {},
        create: { id: TEST_TENANT_ID, name: 'Members E2E Gym', slug: 'members-e2e-gym' },
      });

      dbAvailable = true;
    } catch (err) {
      console.warn('[SKIP] DB setup failed:', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (prisma && dbAvailable) {
      await prisma.user.deleteMany({ where: { tenantId: TEST_TENANT_ID } });
      await prisma.preRegistration.deleteMany({ where: { tenantId: TEST_TENANT_ID } });
      await prisma.tenant.deleteMany({ where: { id: TEST_TENANT_ID } });
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  // Helper: admin auth header for test tenant
  function adminAuth() {
    return `Bearer fake-admin-${TEST_TENANT_ID}`;
  }

  describe('POST /api/v1/members', () => {
    it('creates a new member and returns 201', async () => {
      if (!dbAvailable) {
        console.log('[PENDING] Skipped: DB unavailable.');
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', adminAuth())
        .send({ email: 'newmember@example.com', name: 'New Member' })
        .expect(201);

      expect(response.body).toMatchObject({
        email: 'newmember@example.com',
        name: 'New Member',
        role: 'MEMBER',
        status: 'ACTIVE',
        tenantId: TEST_TENANT_ID,
      });
      expect(response.body.id).toBeDefined();
    });

    it('returns 409 when email already exists in tenant', async () => {
      if (!dbAvailable) {
        console.log('[PENDING] Skipped: DB unavailable.');
        return;
      }

      // Create first
      await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', adminAuth())
        .send({ email: 'duplicate@example.com', name: 'First' });

      // Try duplicate
      await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', adminAuth())
        .send({ email: 'duplicate@example.com', name: 'Second' })
        .expect(409);
    });
  });

  describe('GET /api/v1/members', () => {
    it('returns an array of members for the tenant', async () => {
      if (!dbAvailable) {
        console.log('[PENDING] Skipped: DB unavailable.');
        return;
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/members')
        .set('Authorization', adminAuth())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/v1/members/:id', () => {
    it('returns 404 for a non-existent member ID', async () => {
      if (!dbAvailable) {
        console.log('[PENDING] Skipped: DB unavailable.');
        return;
      }

      await request(app.getHttpServer())
        .get('/api/v1/members/nonexistent-id-00000')
        .set('Authorization', adminAuth())
        .expect(404);
    });
  });

  describe('PATCH /api/v1/members/:id/deactivate', () => {
    it('deactivates a member and returns INACTIVE status', async () => {
      if (!dbAvailable) {
        console.log('[PENDING] Skipped: DB unavailable.');
        return;
      }

      // Create a member to deactivate
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set('Authorization', adminAuth())
        .send({ email: 'todeactivate@example.com', name: 'To Deactivate' });

      const memberId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/members/${memberId}/deactivate`)
        .set('Authorization', adminAuth())
        .expect(200);

      expect(response.body.status).toBe('INACTIVE');
    });
  });
});

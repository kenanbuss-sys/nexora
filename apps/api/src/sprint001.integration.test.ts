import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 001 acceptance tests (docs/implementation/SPRINT_001_TENANT_IAM.md):
 * synthetic two-tenant isolation through the API, scoped permissions,
 * suspension, audit actor/correlation/source, brand-config retrieval, and
 * transactional-outbox behavior. Real PostgreSQL + Redis (INTEGRATION=1).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 001 — tenant, identity, organization & audit', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-a', subject: 'idp|admin-a' });
  const tokenB = identity.signToken({ tenantSlug: 'test-b', subject: 'idp|admin-b' });

  let tenantAId = '';
  let tenantBId = '';
  let adminAId = '';
  let branchId = '';
  let legalEntityAId = '';
  let legalEntityBId = '';

  async function api(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    token: string,
    payload?: unknown,
  ) {
    const response = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    });
    return { status: response.statusCode, body: response.json() as Record<string, unknown> };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 3 });
    // Clean slate for the synthetic tenants (order respects FKs).
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "outbox_event", "audit_event", "user_role_assignment", "role_permission",
       "role", "user", "branch", "factory", "business_unit", "legal_entity",
       "tenant_configuration_version", "tenant" CASCADE`,
    );
    const { createApiApp } = await import('./app.factory.js');
    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('platform operator provisions two tenants with initial admins', async () => {
    const a = await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-a',
      name: 'Synthetic Tenant A',
      initialAdmin: {
        email: 'admin@test-a.example',
        displayName: 'Admin A',
        idpSubject: 'idp|admin-a',
      },
    });
    expect(a.status).toBe(201);
    tenantAId = (a.body.tenant as { id: string }).id;
    adminAId = a.body.adminUserId as string;

    const b = await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-b',
      name: 'Synthetic Tenant B',
      initialAdmin: {
        email: 'admin@test-b.example',
        displayName: 'Admin B',
        idpSubject: 'idp|admin-b',
      },
    });
    expect(b.status).toBe(201);
    tenantBId = (b.body.tenant as { id: string }).id;
    expect(tenantAId).not.toBe(tenantBId);
  });

  it('rejects non-platform sessions from provisioning tenants', async () => {
    const r = await api('POST', '/api/v1/tenants', tokenA, { slug: 'test-c', name: 'C' });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('FORBIDDEN');
  });

  it('unauthenticated and invalid tokens are rejected with canonical errors', async () => {
    const none = await app.inject({ method: 'GET', url: '/api/v1/organization/tree' });
    expect(none.statusCode).toBe(401);
    expect((none.json() as { code: string }).code).toBe('UNAUTHENTICATED');
    const bad = await api('GET', '/api/v1/organization/tree', 'not.a-token');
    expect(bad.status).toBe(401);
  });

  it('tenant admin builds an organization tree', async () => {
    const le = await api('POST', '/api/v1/organization/legal-entities', tokenA, {
      name: 'Alpha d.o.o.',
      code: 'ALPHA',
    });
    expect(le.status).toBe(201);
    legalEntityAId = le.body.id as string;

    const bu = await api('POST', '/api/v1/organization/business-units', tokenA, {
      legalEntityId: legalEntityAId,
      name: 'Operations',
    });
    expect(bu.status).toBe(201);

    const branch = await api('POST', '/api/v1/organization/branches', tokenA, {
      businessUnitId: bu.body.id,
      name: 'Branch One',
    });
    expect(branch.status).toBe(201);
    branchId = branch.body.id as string;

    const factory = await api('POST', '/api/v1/organization/factories', tokenA, {
      businessUnitId: bu.body.id,
      name: 'Factory One',
    });
    expect(factory.status).toBe(201);

    const tree = await api('GET', '/api/v1/organization/tree', tokenA);
    expect(tree.status).toBe(200);
    const entities = tree.body.legalEntities as Array<{
      name: string;
      businessUnits: Array<{ branches: unknown[]; factories: unknown[] }>;
    }>;
    expect(entities).toHaveLength(1);
    expect(entities[0]?.businessUnits[0]?.branches).toHaveLength(1);
    expect(entities[0]?.businessUnits[0]?.factories).toHaveLength(1);

    const leB = await api('POST', '/api/v1/organization/legal-entities', tokenB, {
      name: 'Beta GmbH',
    });
    legalEntityBId = leB.body.id as string;
  });

  it('TENANT ISOLATION: tenant A cannot see or use tenant B resources by id', async () => {
    // Foreign ids from another tenant behave as nonexistent (404), on every endpoint.
    const buWithForeignLe = await api('POST', '/api/v1/organization/business-units', tokenA, {
      legalEntityId: legalEntityBId,
      name: 'Sneaky BU',
    });
    expect(buWithForeignLe.status).toBe(404);

    const adminBUser = await prisma.user.findFirst({ where: { tenantId: tenantBId } });
    const foreignUser = await api('GET', `/api/v1/users/${adminBUser?.id}`, tokenA);
    expect(foreignUser.status).toBe(404);

    const roleB = await prisma.role.findFirst({ where: { tenantId: tenantBId } });
    const foreignRole = await api('PUT', `/api/v1/roles/${roleB?.id}/permissions`, tokenA, {
      permissions: ['organization.read'],
    });
    expect(foreignRole.status).toBe(404);

    const foreignSuspend = await api('POST', `/api/v1/users/${adminBUser?.id}/suspend`, tokenA, {
      reason: 'cross-tenant attempt',
    });
    expect(foreignSuspend.status).toBe(404);

    // A's tree contains nothing of B.
    const treeB = await api('GET', '/api/v1/organization/tree', tokenB);
    const namesB = JSON.stringify(treeB.body);
    expect(namesB).not.toContain('Alpha');
  });

  it('an identity not linked in the tenant gets no permissions and no access', async () => {
    const crossToken = identity.signToken({ tenantSlug: 'test-b', subject: 'idp|admin-a' });
    const perms = await api('GET', '/api/v1/me/permissions', crossToken);
    expect(perms.status).toBe(200);
    expect(perms.body.grants).toEqual([]);
    const attempt = await api('POST', '/api/v1/users/invite', crossToken, {
      email: 'x@y.example',
      displayName: 'X',
    });
    expect(attempt.status).toBe(403);
  });

  it('SCOPED PERMISSIONS: a branch-scoped role grants only its scope and nothing more', async () => {
    const picker = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'picker@test-a.example',
      displayName: 'Picker',
      idpSubject: 'idp|picker-a',
    });
    expect(picker.status).toBe(201);

    const role = await api('POST', '/api/v1/roles', tokenA, {
      name: 'branch-picker',
      permissions: ['inventory.pick', 'inventory.read'],
    });
    expect(role.status).toBe(201);

    const assign = await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: picker.body.id,
      roleId: role.body.id,
      scopeType: 'BRANCH',
      scopeId: branchId,
    });
    expect(assign.status).toBe(201);

    const pickerToken = identity.signToken({ tenantSlug: 'test-a', subject: 'idp|picker-a' });
    const grants = await api('GET', '/api/v1/me/permissions', pickerToken);
    expect(grants.body.grants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          permissionKey: 'inventory.pick',
          scopeType: 'BRANCH',
          scopeId: branchId,
        }),
      ]),
    );

    // No iam.user.manage anywhere in scope -> cannot invite users.
    const denied = await api('POST', '/api/v1/users/invite', pickerToken, {
      email: 'nope@test-a.example',
      displayName: 'Nope',
    });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('FORBIDDEN');

    // Assigning the role to a scope in another tenant's branch fails as 404.
    const branchB = await prisma.branch.findFirst({ where: { tenantId: tenantBId } });
    const badAssign = await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: picker.body.id,
      roleId: role.body.id,
      scopeType: 'BRANCH',
      scopeId: branchB?.id ?? '00000000-0000-0000-0000-000000000001',
    });
    expect(badAssign.status).toBe(404);
  });

  it('SUSPENSION: a suspended user cannot mutate business state', async () => {
    const target = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'suspended@test-a.example',
      displayName: 'Soon Suspended',
      idpSubject: 'idp|suspended-a',
    });
    // Give them a powerful role, then suspend them: role must not matter.
    const roleId = (
      await prisma.role.findFirst({
        where: { tenantId: tenantAId, name: 'tenant-admin' },
      })
    )?.id;
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: target.body.id,
      roleId,
    });
    const suspend = await api('POST', `/api/v1/users/${target.body.id}/suspend`, tokenA, {
      reason: 'security incident',
    });
    expect(suspend.status).toBe(201);

    const suspendedToken = identity.signToken({
      tenantSlug: 'test-a',
      subject: 'idp|suspended-a',
    });
    const attempt = await api('POST', '/api/v1/users/invite', suspendedToken, {
      email: 'blocked@test-a.example',
      displayName: 'Blocked',
    });
    expect(attempt.status).toBe(403);
    expect(attempt.body.code).toBe('USER_SUSPENDED');
  });

  it('TENANT SUSPENSION: a suspended tenant cannot mutate business state', async () => {
    const suspend = await api('POST', `/api/v1/tenants/${tenantBId}/suspend`, platformToken, {
      reason: 'contract hold',
    });
    expect(suspend.status).toBe(201);
    const attempt = await api('POST', '/api/v1/organization/legal-entities', tokenB, {
      name: 'Should Fail',
    });
    expect(attempt.status).toBe(403);
    expect(attempt.body.code).toBe('TENANT_SUSPENDED');
  });

  it('BRAND CONFIG: versioned publish and tenant-scoped retrieval', async () => {
    const empty = await api('GET', '/api/v1/tenant/configuration', tokenA);
    expect(empty.status).toBe(200);
    expect(empty.body.version).toBe(0);

    const v1 = await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { brand: { primaryColor: '#0044cc', appTitle: 'Alpha Ops' } },
    });
    expect(v1.status).toBe(201);
    expect(v1.body.version).toBe(1);

    const v2 = await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { brand: { primaryColor: '#0055dd', appTitle: 'Alpha Ops' } },
    });
    expect(v2.body.version).toBe(2);

    const current = await api('GET', '/api/v1/tenant/configuration', tokenA);
    expect(current.body.version).toBe(2);
    expect(current.body.config).toMatchObject({ brand: { primaryColor: '#0055dd' } });
  });

  it('AUDIT: critical mutations carry actor, correlation ID and source', async () => {
    const correlationId = 'audit-check-12345678';
    await app.inject({
      method: 'POST',
      url: '/api/v1/organization/legal-entities',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
        'x-correlation-id': correlationId,
      },
      payload: { name: 'Audit Probe Entity' },
    });

    const entry = await prisma.auditEvent.findFirst({
      where: { tenantId: tenantAId, action: 'organization.legal_entity.create', correlationId },
    });
    expect(entry).not.toBeNull();
    expect(entry?.actorType).toBe('USER');
    expect(entry?.actorId).toBe(adminAId);
    expect(entry?.source).toBe('api');

    const suspension = await prisma.auditEvent.findFirst({
      where: { tenantId: tenantAId, action: 'user.suspend' },
    });
    expect(suspension?.reason).toBe('security incident');
    expect(suspension?.previousValues).toMatchObject({ status: 'ACTIVE' });
    expect(suspension?.newValues).toMatchObject({ status: 'SUSPENDED' });

    // Audit events for tenant A never leak into tenant B and vice versa.
    const crossCount = await prisma.auditEvent.count({
      where: { tenantId: tenantBId, action: 'organization.legal_entity.create' },
    });
    expect(crossCount).toBe(1); // only B's own "Beta GmbH" creation
  });

  it('OUTBOX: business events are written transactionally with correct payloads', async () => {
    const events = await prisma.outboxEvent.findMany({ where: { tenantId: tenantAId } });
    const types = events.map((e) => e.eventType);
    expect(types).toContain('tenant.created');
    expect(types).toContain('user.invited');
    expect(types).toContain('permission.changed');
    expect(types).toContain('tenant.configuration.changed');

    const configEvent = events.find((e) => e.eventType === 'tenant.configuration.changed');
    expect(configEvent?.payload).toMatchObject({ tenantId: tenantAId, configVersion: 1 });
    expect(configEvent?.correlationId).toBeTruthy();
    expect(configEvent?.status).toBe('PENDING');
  });

  it('correlation ID round-trips through the API', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-correlation-id': 'roundtrip-abcdef12' },
    });
    expect(response.headers['x-correlation-id']).toBe('roundtrip-abcdef12');
  });
});

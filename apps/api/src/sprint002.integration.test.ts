import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { TaskService } from '@nexora/domain-core';
import { ApprovalService, RuleService, type ActionExecutor } from '@nexora/domain-wf';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 002 acceptance tests (docs/implementation/SPRINT_002_CONFIG_WORKFLOW.md):
 * terminology & module flags, custom-field foundation, tasks/inbox, versioned
 * workflow engine with pinned instances, approval SoD, idempotent declarative
 * rules, immutable document templates. Real PostgreSQL (INTEGRATION=1).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 002 — configuration, workflow, rules & documents', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const adminToken = identity.signToken({ tenantSlug: 'test-s2a', subject: 'idp|s2-admin' });
  const otherAdminToken = identity.signToken({ tenantSlug: 'test-s2a', subject: 'idp|s2-second' });
  const tenantBToken = identity.signToken({ tenantSlug: 'test-s2b', subject: 'idp|s2b-admin' });

  let tenantAId = '';
  let secondUserId = '';

  async function api(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    token: string,
    payload?: unknown,
  ) {
    const response = await app.inject({
      method,
      url,
      headers: {
        authorization: `Bearer ${token}`,
        ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    });
    return { status: response.statusCode, body: response.json() as Record<string, unknown> };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 3 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "processed_event", "rule_version", "rule_definition",
       "workflow_instance", "workflow_version", "workflow_definition",
       "approval", "task", "notification", "terminology_entry",
       "module_activation", "custom_field_definition",
       "document_template_version", "document_template",
       "outbox_event", "audit_event", "user_role_assignment", "role_permission",
       "role", "user", "branch", "factory", "business_unit", "legal_entity",
       "tenant_configuration_version", "tenant" CASCADE`,
    );
    const { createApiApp } = await import('./app.factory.js');
    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const a = await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s2a',
      name: 'Sprint2 Tenant A',
      initialAdmin: {
        email: 'admin@s2a.example',
        displayName: 'S2 Admin',
        idpSubject: 'idp|s2-admin',
      },
    });
    tenantAId = (a.body.tenant as { id: string }).id;
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s2b',
      name: 'Sprint2 Tenant B',
      initialAdmin: {
        email: 'admin@s2b.example',
        displayName: 'S2B Admin',
        idpSubject: 'idp|s2b-admin',
      },
    });
    // Second user in tenant A with the same admin role (for SoD tests).
    const second = await api('POST', '/api/v1/users/invite', adminToken, {
      email: 'second@s2a.example',
      displayName: 'Second Admin',
      idpSubject: 'idp|s2-second',
    });
    secondUserId = second.body.id as string;
    const role = await prisma.role.findFirst({
      where: { tenantId: tenantAId, name: 'tenant-admin' },
    });
    await api('POST', '/api/v1/roles/assign', adminToken, {
      userId: secondUserId,
      roleId: role?.id,
    });
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('TERMINOLOGY: per-tenant labels, isolated between tenants', async () => {
    const set = await api('PUT', '/api/v1/configuration/terminology/en', adminToken, {
      entries: { warehouse: 'Depot', order: 'Sales Ticket' },
    });
    expect(set.status).toBe(200);
    const get = await api('GET', '/api/v1/configuration/terminology/en', adminToken);
    expect(get.body.entries).toMatchObject({ warehouse: 'Depot', order: 'Sales Ticket' });
    const other = await api('GET', '/api/v1/configuration/terminology/en', tenantBToken);
    expect(other.body.entries).toEqual({});
  });

  it('MODULES: activation flags per tenant', async () => {
    await api('PUT', '/api/v1/configuration/modules/wms', adminToken, { enabled: true });
    await api('PUT', '/api/v1/configuration/modules/mes', adminToken, { enabled: false });
    const modules = await api('GET', '/api/v1/configuration/modules', adminToken);
    expect(modules.body.modules).toMatchObject({ wms: true, mes: false });
    const otherModules = await api('GET', '/api/v1/configuration/modules', tenantBToken);
    expect(otherModules.body.modules).toEqual({});
  });

  it('CUSTOM FIELDS: definition foundation with per-tenant uniqueness', async () => {
    const created = await api('POST', '/api/v1/configuration/custom-fields', adminToken, {
      objectType: 'SalesOrder',
      key: 'delivery_window',
      label: 'Delivery window',
      fieldType: 'SELECT',
      config: { options: ['AM', 'PM'] },
    });
    expect(created.status).toBe(201);
    const duplicate = await api('POST', '/api/v1/configuration/custom-fields', adminToken, {
      objectType: 'SalesOrder',
      key: 'delivery_window',
      label: 'Again',
      fieldType: 'TEXT',
    });
    expect(duplicate.status).toBe(409);
    const listed = await api('GET', '/api/v1/configuration/custom-fields/SalesOrder', adminToken);
    expect(listed.body.fields).toHaveLength(1);
  });

  it('WORKFLOW: versions are immutable, instances stay pinned to their version', async () => {
    const v1 = await api('POST', '/api/v1/workflows/publish', adminToken, {
      key: 'doc-review',
      name: 'Document review',
      spec: {
        initial: 'DRAFT',
        states: [{ name: 'DRAFT' }, { name: 'REVIEW' }, { name: 'APPROVED', terminal: true }],
        transitions: [
          { from: 'DRAFT', to: 'REVIEW', trigger: 'submit' },
          {
            from: 'REVIEW',
            to: 'APPROVED',
            trigger: 'approve',
            requiredPermission: 'approval.act',
          },
        ],
      },
    });
    expect(v1.status).toBe(201);
    expect(v1.body.version).toBe(1);

    const instance = await api('POST', '/api/v1/workflows/instances', adminToken, {
      definitionKey: 'doc-review',
    });
    expect(instance.body.currentState).toBe('DRAFT');
    const instanceId = instance.body.id as string;

    // Invalid transition from DRAFT.
    const invalid = await api(
      'POST',
      `/api/v1/workflows/instances/${instanceId}/transition`,
      adminToken,
      {
        trigger: 'approve',
      },
    );
    expect(invalid.status).toBe(409);
    expect(invalid.body.code).toBe('INVALID_STATE');

    const submitted = await api(
      'POST',
      `/api/v1/workflows/instances/${instanceId}/transition`,
      adminToken,
      {
        trigger: 'submit',
      },
    );
    expect(submitted.status).toBe(201);
    expect(submitted.body.currentState).toBe('REVIEW');

    // Publish v2 with a DIFFERENT graph (no "approve" from REVIEW).
    const v2 = await api('POST', '/api/v1/workflows/publish', adminToken, {
      key: 'doc-review',
      name: 'Document review',
      spec: {
        initial: 'DRAFT',
        states: [{ name: 'DRAFT' }, { name: 'DONE', terminal: true }],
        transitions: [{ from: 'DRAFT', to: 'DONE', trigger: 'finish' }],
      },
    });
    expect(v2.body.version).toBe(2);

    // The running instance still follows its pinned v1 graph.
    const approved = await api(
      'POST',
      `/api/v1/workflows/instances/${instanceId}/transition`,
      adminToken,
      {
        trigger: 'approve',
      },
    );
    expect(approved.status).toBe(201);
    expect(approved.body.currentState).toBe('APPROVED');
    expect(approved.body.status).toBe('COMPLETED');
    expect(approved.body.version).toBe(1);

    // A terminal instance refuses further transitions.
    const after = await api(
      'POST',
      `/api/v1/workflows/instances/${instanceId}/transition`,
      adminToken,
      {
        trigger: 'submit',
      },
    );
    expect(after.status).toBe(409);

    // A new instance starts on v2.
    const fresh = await api('POST', '/api/v1/workflows/instances', adminToken, {
      definitionKey: 'doc-review',
    });
    expect(fresh.body.version).toBe(2);
  });

  it('WORKFLOW: permission-guarded transition is denied without the permission', async () => {
    const picker = await api('POST', '/api/v1/users/invite', adminToken, {
      email: 'wf-limited@s2a.example',
      displayName: 'Limited',
      idpSubject: 'idp|s2-limited',
    });
    const role = await api('POST', '/api/v1/roles', adminToken, {
      name: 'wf-reader',
      permissions: ['workflow.read'],
    });
    await api('POST', '/api/v1/roles/assign', adminToken, {
      userId: picker.body.id,
      roleId: role.body.id,
    });
    const limitedToken = identity.signToken({ tenantSlug: 'test-s2a', subject: 'idp|s2-limited' });

    const instance = await api('POST', '/api/v1/workflows/instances', limitedToken, {
      definitionKey: 'doc-review',
    });
    // v2 graph: finish has no permission -> allowed even for limited user? v2 has no guard;
    // publish v3 with a guarded transition to test the guard itself.
    await api('POST', '/api/v1/workflows/publish', adminToken, {
      key: 'guarded',
      name: 'Guarded flow',
      spec: {
        initial: 'START',
        states: [{ name: 'START' }, { name: 'END', terminal: true }],
        transitions: [
          { from: 'START', to: 'END', trigger: 'close', requiredPermission: 'approval.act' },
        ],
      },
    });
    const guarded = await api('POST', '/api/v1/workflows/instances', limitedToken, {
      definitionKey: 'guarded',
    });
    const denied = await api(
      'POST',
      `/api/v1/workflows/instances/${guarded.body.id}/transition`,
      limitedToken,
      { trigger: 'close' },
    );
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('FORBIDDEN');
    expect(instance.status).toBe(201);
  });

  it('APPROVALS: segregation of duties and single decision', async () => {
    const requested = await api('POST', '/api/v1/approvals/request', adminToken, {
      title: 'Approve price override',
      subjectObjectType: 'Quote',
      subjectObjectId: 'q-123',
    });
    expect(requested.status).toBe(201);
    const approvalId = requested.body.id as string;

    // The requester cannot decide their own approval (SoD).
    const own = await api('POST', `/api/v1/approvals/${approvalId}/approve`, adminToken, {});
    expect(own.status).toBe(403);

    // It appears in the second admin's pending list, not the requester's.
    const pendingSecond = await api('GET', '/api/v1/approvals/pending', otherAdminToken);
    expect(JSON.stringify(pendingSecond.body)).toContain(approvalId);
    const pendingown = await api('GET', '/api/v1/approvals/pending', adminToken);
    expect(JSON.stringify(pendingown.body)).not.toContain(approvalId);

    const granted = await api('POST', `/api/v1/approvals/${approvalId}/approve`, otherAdminToken, {
      reason: 'margin verified',
    });
    expect(granted.status).toBe(201);
    expect(granted.body.status).toBe('GRANTED');

    // Already decided -> conflict.
    const again = await api('POST', `/api/v1/approvals/${approvalId}/reject`, otherAdminToken, {});
    expect(again.status).toBe(409);

    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId: tenantAId, action: 'approval.grant' },
    });
    expect(audit?.actorId).toBe(secondUserId);
    expect(audit?.reason).toBe('margin verified');
  });

  it('RULES: a rule fires exactly once per event, duplicates are no-ops', async () => {
    const published = await api('POST', '/api/v1/rules/publish', adminToken, {
      key: 'config-review',
      name: 'Review config changes',
      spec: {
        when: 'tenant.configuration.changed',
        if: [{ path: 'configVersion', op: 'gt', value: 0 }],
        then: [{ action: 'create_task', title: 'Review configuration change' }],
      },
    });
    expect(published.status).toBe(201);

    // Produce the business event.
    await api('POST', '/api/v1/tenant/configuration', adminToken, {
      config: { brand: { appTitle: 'S2' } },
    });
    const event = await prisma.outboxEvent.findFirst({
      where: { tenantId: tenantAId, eventType: 'tenant.configuration.changed' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(event).not.toBeNull();

    // Evaluate exactly as the worker does (owning-domain services as executor).
    const rules = new RuleService(prisma);
    const tasks = new TaskService(prisma);
    const approvals = new ApprovalService(prisma);
    const executor: ActionExecutor = {
      createTask: async (tx, tenantId, input) => {
        await tasks.createTaskInTx(tx, tenantId, { title: input.title });
      },
      notify: async (tx, tenantId, input) => {
        await tasks.notifyInTx(tx, tenantId, {
          userId: input.userId,
          type: 'automation',
          title: input.title,
        });
      },
      requestApproval: async (tx, tenantId, input) => {
        await approvals.requestApprovalInTx(
          tx,
          {
            title: input.title,
            subjectObjectType: 'OutboxEvent',
            subjectObjectId: input.relatedEventId,
          },
          { tenantId, actorType: 'SYSTEM', source: 'worker' },
        );
      },
    };
    const ruleEvent = {
      id: event?.id as string,
      tenantId: tenantAId,
      eventType: 'tenant.configuration.changed',
      payload: event?.payload,
      correlationId: event?.correlationId as string,
    };

    const first = await rules.evaluateEvent(ruleEvent, executor);
    expect(first).toBe(1);
    const duplicate = await rules.evaluateEvent(ruleEvent, executor);
    expect(duplicate).toBe(0);

    const created = await prisma.task.findMany({
      where: { tenantId: tenantAId, title: 'Review configuration change' },
    });
    expect(created).toHaveLength(1);
  });

  it('INBOX: unified view returns only the caller’s items', async () => {
    await api('POST', '/api/v1/tasks', adminToken, {
      title: 'Prepare go-live checklist',
      assigneeUserId: secondUserId,
    });
    const inboxSecond = await api('GET', '/api/v1/inbox', otherAdminToken);
    const secondTasks = JSON.stringify(inboxSecond.body.tasks);
    expect(secondTasks).toContain('Prepare go-live checklist');

    const inboxB = await api('GET', '/api/v1/inbox', tenantBToken);
    expect(JSON.stringify(inboxB.body)).not.toContain('Prepare go-live checklist');
    expect(inboxB.body).toHaveProperty('tasks');
    expect(inboxB.body).toHaveProperty('approvals');
    expect(inboxB.body).toHaveProperty('notifications');
  });

  it('TASKS: complete flow with audit and invalid-state handling', async () => {
    const task = await api('POST', '/api/v1/tasks', adminToken, { title: 'One-off task' });
    const done = await api('POST', `/api/v1/tasks/${task.body.id}/complete`, adminToken);
    expect(done.body.status).toBe('DONE');
    const again = await api('POST', `/api/v1/tasks/${task.body.id}/complete`, adminToken);
    expect(again.status).toBe(409);
    const foreign = await api('POST', `/api/v1/tasks/${task.body.id}/complete`, tenantBToken);
    expect(foreign.status).toBe(404);
  });

  it('DOCUMENT TEMPLATES: immutable versions, latest and specific retrieval', async () => {
    const v1 = await api('POST', '/api/v1/document-templates/publish', adminToken, {
      key: 'order-confirmation',
      name: 'Order confirmation',
      content: 'Hello {{customer}} — v1',
    });
    expect(v1.body.version).toBe(1);
    const v2 = await api('POST', '/api/v1/document-templates/publish', adminToken, {
      key: 'order-confirmation',
      name: 'Order confirmation',
      content: 'Hello {{customer}} — v2',
    });
    expect(v2.body.version).toBe(2);

    const latest = await api('GET', '/api/v1/document-templates/order-confirmation', adminToken);
    expect(latest.body.version).toBe(2);
    const specific = await api(
      'GET',
      '/api/v1/document-templates/order-confirmation?version=1',
      adminToken,
    );
    expect(specific.body.content).toContain('v1');

    const foreign = await api('GET', '/api/v1/document-templates/order-confirmation', tenantBToken);
    expect(foreign.status).toBe(404);
  });
});

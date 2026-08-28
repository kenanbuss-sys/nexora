import { createDb, type PrismaClient } from '@nexora/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dispatchPendingOutbox } from './outbox';

/**
 * Outbox dispatcher integration tests against real PostgreSQL (INTEGRATION=1):
 * exactly-once claim/flip, duplicate-run safety, failure retry semantics.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';

integration('outbox dispatcher (integration)', () => {
  let prisma: PrismaClient;
  let tenantId = '';

  beforeAll(async () => {
    prisma = createDb({ connectionString: DB_URL, max: 3 });
    const tenant = await prisma.tenant.upsert({
      where: { slug: 'test-outbox' },
      create: { slug: 'test-outbox', name: 'Outbox Test Tenant' },
      update: {},
    });
    tenantId = tenant.id;
    await prisma.outboxEvent.deleteMany({ where: { tenantId } });
    for (let i = 0; i < 3; i += 1) {
      await prisma.outboxEvent.create({
        data: {
          tenantId,
          eventType: 'tenant.configuration.changed',
          aggregateType: 'Tenant',
          aggregateId: tenantId,
          actorType: 'SYSTEM',
          correlationId: `outbox-test-${i}`,
          payload: { tenantId, configVersion: i },
        },
      });
    }
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('dispatches each pending event exactly once, even across repeated runs', async () => {
    const delivered: string[] = [];
    const first = await dispatchPendingOutbox(prisma, async (e) => {
      delivered.push(e.id);
    });
    expect(first.dispatched).toBe(3);
    expect(first.failed).toBe(0);

    const second = await dispatchPendingOutbox(prisma, async (e) => {
      delivered.push(e.id);
    });
    expect(second.dispatched).toBe(0);
    expect(new Set(delivered).size).toBe(delivered.length);

    const statuses = await prisma.outboxEvent.findMany({ where: { tenantId } });
    expect(statuses.every((e) => e.status === 'DISPATCHED')).toBe(true);
    expect(statuses.every((e) => e.dispatchedAt !== null)).toBe(true);
  });

  it('a failing delivery stays PENDING with attempts incremented, then retries', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        tenantId,
        eventType: 'tenant.configuration.changed',
        aggregateType: 'Tenant',
        aggregateId: tenantId,
        actorType: 'SYSTEM',
        correlationId: 'outbox-test-fail',
        payload: { tenantId },
      },
    });

    const failing = await dispatchPendingOutbox(prisma, async () => {
      throw new Error('downstream unavailable');
    });
    expect(failing.failed).toBe(1);
    expect(failing.dispatched).toBe(0);

    const pending = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(pending.status).toBe('PENDING');
    expect(pending.attempts).toBe(1);
    expect(pending.lastError).toContain('downstream unavailable');

    const retry = await dispatchPendingOutbox(prisma, async () => undefined);
    expect(retry.dispatched).toBe(1);
    const done = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(done.status).toBe('DISPATCHED');
  });
});

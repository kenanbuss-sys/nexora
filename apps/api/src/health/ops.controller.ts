import { Controller, Get, Inject } from '@nestjs/common';
import type { PrismaClient } from '@nexora/db';
import { PRISMA } from '../auth/auth.guard';
import { PlatformOnly } from '../auth/permissions.guard';

/**
 * Platform observability (OPS-007). One platform-operator view of the
 * pipes: outbox backlog and failures, audit volume, tenant count and
 * the age of the oldest pending event — the number that says whether
 * the worker is keeping up.
 */
@Controller('api/v1/ops')
export class OpsController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get('observability')
  @PlatformOnly()
  async observability() {
    const [pendingOutbox, failedOutbox, dispatchedOutbox, tenants, auditEvents, oldestPending] =
      await Promise.all([
        this.prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
        this.prisma.outboxEvent.count({ where: { status: 'FAILED' } }),
        this.prisma.outboxEvent.count({ where: { status: 'DISPATCHED' } }),
        this.prisma.tenant.count(),
        this.prisma.auditEvent.count(),
        this.prisma.outboxEvent.findFirst({
          where: { status: 'PENDING' },
          orderBy: { occurredAt: 'asc' },
          select: { occurredAt: true },
        }),
      ]);
    return {
      outbox: {
        pending: pendingOutbox,
        failed: failedOutbox,
        dispatched: dispatchedOutbox,
        oldestPendingAgeSeconds: oldestPending
          ? Math.floor((Date.now() - oldestPending.occurredAt.getTime()) / 1000)
          : 0,
      },
      tenants,
      auditEvents,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Release management (OPS-004): what is running and what is applied. */
  @Get('release')
  @PlatformOnly()
  async release() {
    const migrations = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT count(*)::bigint AS count FROM information_schema.tables WHERE table_schema = current_schema()',
    );
    return {
      service: 'nexora-api',
      version: process.env.NEXORA_VERSION ?? '0.0.0-dev',
      node: process.version,
      tables: Number(migrations[0]?.count ?? 0),
      startedAt: new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString(),
    };
  }

  /** Error tracking (OPS-008): recent unhandled API errors. */
  @Get('errors')
  @PlatformOnly()
  async errors() {
    const rows = await this.prisma.securityEvent.findMany({
      where: { eventType: 'api.error' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      total: rows.length,
      errors: rows.map((row) => ({
        correlationId: row.subject,
        detail: row.detail,
        at: row.createdAt.toISOString(),
      })),
    };
  }

  /** Integration monitoring (OPS-009): webhook delivery health per tenant. */
  @Get('integrations')
  @PlatformOnly()
  async integrations() {
    const grouped = await this.prisma.webhookDelivery.groupBy({
      by: ['tenantId', 'status'],
      _count: { _all: true },
    });
    const tenants = await this.prisma.tenant.findMany({ select: { id: true, slug: true } });
    const slugOf = new Map(tenants.map((t) => [t.id, t.slug]));
    const rows = new Map<string, Record<string, number>>();
    for (const entry of grouped) {
      const row = rows.get(entry.tenantId) ?? {};
      row[entry.status] = entry._count._all;
      rows.set(entry.tenantId, row);
    }
    return {
      tenants: [...rows.entries()].map(([tenantId, counts]) => ({
        tenant: slugOf.get(tenantId) ?? tenantId,
        pending: counts.PENDING ?? 0,
        delivered: counts.DELIVERED ?? 0,
        failed: counts.FAILED ?? 0,
        dead: counts.DEAD ?? 0,
      })),
    };
  }

  /** Device monitoring (OPS-010): fleet health, stale devices flagged. */
  @Get('devices')
  @PlatformOnly()
  async devices() {
    const devices = await this.prisma.device.findMany({
      select: { tenantId: true, status: true, lastSeenAt: true },
      take: 5000,
    });
    const tenants = await this.prisma.tenant.findMany({ select: { id: true, slug: true } });
    const slugOf = new Map(tenants.map((t) => [t.id, t.slug]));
    const staleBefore = Date.now() - 24 * 3_600_000;
    const rows = new Map<string, { total: number; active: number; stale: number }>();
    for (const device of devices) {
      const row = rows.get(device.tenantId) ?? { total: 0, active: 0, stale: 0 };
      row.total += 1;
      if (device.status === 'ACTIVE') row.active += 1;
      if (
        device.status === 'ACTIVE' &&
        (device.lastSeenAt === null || device.lastSeenAt.getTime() < staleBefore)
      ) {
        row.stale += 1;
      }
      rows.set(device.tenantId, row);
    }
    return {
      tenants: [...rows.entries()].map(([tenantId, counts]) => ({
        tenant: slugOf.get(tenantId) ?? tenantId,
        ...counts,
      })),
    };
  }
}

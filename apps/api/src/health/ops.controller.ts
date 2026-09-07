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
}

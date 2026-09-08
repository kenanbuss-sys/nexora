import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Printer adapter (DEV-006). Label jobs are rendered server-side into
 * ZPL (vendor-neutral enough for the common thermal fleet — a future
 * adapter can transform per printer language) and queued per
 * registered PRINTER device; devices drain their queue with their
 * enrollment token and acknowledge each job exactly once. The queue
 * and acknowledgements live in the append-only audit trail.
 */

export interface PrintJobView {
  id: string;
  jobKey: string;
  zpl: string;
  queuedAt: string;
}

/** GS1-128 SSCC label — plain ZPL, one label per package. */
export function zplSsccLabel(input: {
  packageNumber: string;
  ssccCode: string;
  orderNumber: string | null;
}): string {
  return [
    '^XA',
    '^CF0,40',
    `^FO40,40^FD${input.packageNumber}^FS`,
    ...(input.orderNumber ? [`^CF0,28`, `^FO40,95^FD${input.orderNumber}^FS`] : []),
    `^BY3,2,120`,
    `^FO40,140^BCN,120,Y,N,N^FD>;>800${input.ssccCode}^FS`,
    `^CF0,30`,
    `^FO40,290^FDSSCC ${input.ssccCode}^FS`,
    '^XZ',
  ].join('\n');
}

export class PrintService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Queue a rendered label on a PRINTER device, idempotent per jobKey. */
  async queueLabel(
    input: { deviceId: string; jobKey: string; zpl: string },
    ctx: RequestContext,
  ): Promise<{ jobId: string; duplicate: boolean }> {
    if (!/^[A-Za-z0-9._:-]{1,80}$/.test(input.jobKey)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid job key');
    }
    const device = await this.prisma.device.findFirst({
      where: { id: input.deviceId, tenantId: ctx.tenantId },
    });
    if (!device) throw notFound('Device', input.deviceId);
    if (device.deviceType !== 'PRINTER') {
      throw new DomainError('INVALID_STATE', 'Labels queue only on PRINTER devices');
    }
    if (device.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', 'The printer is not active');
    }
    const marker = `${device.id}:${input.jobKey}`;
    const existing = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'dev.print.queue',
        objectType: 'PrintJob',
        objectId: marker,
      },
      select: { id: true },
    });
    if (existing) return { jobId: existing.id, duplicate: true };
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'dev.print.queue',
      objectType: 'PrintJob',
      objectId: marker,
      source: 'api',
      newValues: { deviceId: device.id, jobKey: input.jobKey, zpl: input.zpl },
    });
    const created = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'dev.print.queue',
        objectType: 'PrintJob',
        objectId: marker,
      },
      select: { id: true },
    });
    return { jobId: created?.id ?? marker, duplicate: false };
  }

  /** The device's pending jobs (queued minus acknowledged). */
  async pendingJobs(tenantId: string, deviceId: string): Promise<PrintJobView[]> {
    const [queued, acked] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where: {
          tenantId,
          action: 'dev.print.queue',
          objectType: 'PrintJob',
          objectId: { startsWith: `${deviceId}:` },
        },
        orderBy: { occurredAt: 'asc' },
        take: 100,
      }),
      this.prisma.auditEvent.findMany({
        where: {
          tenantId,
          action: 'dev.print.ack',
          objectType: 'PrintJob',
          objectId: { startsWith: `${deviceId}:` },
        },
        select: { objectId: true },
      }),
    ]);
    const done = new Set(acked.map((a) => a.objectId));
    return queued
      .filter((job) => !done.has(job.objectId))
      .map((job) => ({
        id: job.id,
        jobKey: job.objectId.slice(deviceId.length + 1),
        zpl: (job.newValues as { zpl?: string } | null)?.zpl ?? '',
        queuedAt: job.occurredAt.toISOString(),
      }));
  }

  /** Acknowledge one job — exactly once; a repeat is a no-op. */
  async ackJob(
    tenantId: string,
    deviceId: string,
    jobKey: string,
  ): Promise<{ ok: true; duplicate: boolean }> {
    const marker = `${deviceId}:${jobKey}`;
    const queued = await this.prisma.auditEvent.findFirst({
      where: { tenantId, action: 'dev.print.queue', objectType: 'PrintJob', objectId: marker },
      select: { id: true },
    });
    if (!queued) throw notFound('PrintJob', jobKey);
    const acked = await this.prisma.auditEvent.findFirst({
      where: { tenantId, action: 'dev.print.ack', objectType: 'PrintJob', objectId: marker },
      select: { id: true },
    });
    if (acked) return { ok: true, duplicate: true };
    await writeAudit(this.prisma, {
      tenantId,
      actorType: 'SERVICE',
      actorId: undefined,
      action: 'dev.print.ack',
      objectType: 'PrintJob',
      objectId: marker,
      source: 'device',
      newValues: { deviceId, jobKey },
    });
    return { ok: true, duplicate: false };
  }
}

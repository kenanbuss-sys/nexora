import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient, ScanKind } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * VER domain — verification event stream (VER-001/002 barcode & QR events,
 * VER-017 offline queue, VER-018 idempotent replay, VER-020 correlation).
 *
 * Devices capture events offline and replay them in envelopes when back
 * online. The client-generated event id makes every replay exactly-once:
 * a duplicate is acknowledged, never double-recorded.
 */

export interface ScanEventInput {
  clientEventId: string;
  kind: ScanKind;
  value: string;
  capturedAt: string;
  context?: Record<string, unknown> | undefined;
  correlationId?: string | undefined;
}

export interface ScanEventView {
  id: string;
  deviceId: string;
  kind: ScanKind;
  value: string;
  clientEventId: string;
  capturedAt: string;
  receivedAt: string;
  correlationId: string | null;
  resolvedSkuId: string | null;
}

export interface ScanEnvelopeResult {
  accepted: number;
  duplicates: number;
  results: Array<{ clientEventId: string; eventId: string | null; duplicate: boolean }>;
}

/** Cross-domain contract: barcode identity is owned by PIM. */
export interface SkuResolver {
  resolveBarcode(tenantId: string, value: string): Promise<string | null>;
}

/** Cross-domain contract: device identity is owned by DEV. */
export interface DeviceTokenGate {
  resolveByToken(
    enrollmentToken: string,
  ): Promise<{ deviceId: string; tenantId: string; active: boolean } | null>;
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code?: unknown }).code === 'P2002'
  );
}

export class VerificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly devices: DeviceTokenGate,
    private readonly skus: SkuResolver,
  ) {}

  /**
   * Records an envelope of device-captured events (device-authenticated by
   * enrollment token). Safe to replay after offline periods: duplicates are
   * detected per (device, clientEventId) and acknowledged without effect.
   * Emits one device.event.received per envelope.
   */
  async recordEnvelope(
    enrollmentToken: string,
    events: ScanEventInput[],
  ): Promise<ScanEnvelopeResult> {
    const device = await this.devices.resolveByToken(enrollmentToken);
    if (!device) throw new DomainError('UNAUTHENTICATED', 'Unknown device token');
    if (!device.active) throw new DomainError('FORBIDDEN', 'Device is not active');
    if (events.length === 0 || events.length > 500) {
      throw new DomainError('VALIDATION_FAILED', 'Envelope must contain 1..500 events');
    }

    const results: ScanEnvelopeResult['results'] = [];
    let accepted = 0;
    let duplicates = 0;

    for (const event of events) {
      try {
        const resolvedSkuId =
          event.kind === 'BARCODE'
            ? await this.skus.resolveBarcode(device.tenantId, event.value)
            : null;
        const created = await this.prisma.scanEvent.create({
          data: {
            tenantId: device.tenantId,
            deviceId: device.deviceId,
            kind: event.kind,
            value: event.value,
            clientEventId: event.clientEventId,
            capturedAt: new Date(event.capturedAt),
            ...(event.context !== undefined
              ? { context: event.context as Prisma.InputJsonValue }
              : {}),
            correlationId: event.correlationId ?? null,
            resolvedSkuId,
          },
        });
        accepted += 1;
        results.push({ clientEventId: event.clientEventId, eventId: created.id, duplicate: false });
      } catch (e: unknown) {
        if (isUniqueViolation(e)) {
          duplicates += 1;
          results.push({ clientEventId: event.clientEventId, eventId: null, duplicate: true });
        } else {
          throw e;
        }
      }
    }

    if (accepted > 0) {
      await this.prisma.$transaction(async (tx) => {
        await publishToOutbox(tx, {
          tenantId: device.tenantId,
          eventType: EVENT_TYPES.DEVICE_EVENT_RECEIVED,
          aggregateType: 'Device',
          aggregateId: device.deviceId,
          actorType: 'SERVICE',
          actorId: undefined,
          payload: { deviceId: device.deviceId, accepted, duplicates },
        });
      });
    }

    return { accepted, duplicates, results };
  }

  /**
   * Material check (VER-007/011): does a scanned barcode resolve to the
   * SKU the operator is supposed to be handling, and does the quantity
   * match what is expected? Every check is recorded as an audited
   * verification, mismatch or not — the point is the trail.
   */
  async materialCheck(
    input: {
      expectedSkuId: string;
      barcode: string;
      expectedQty?: number | undefined;
      countedQty?: number | undefined;
    },
    ctx: RequestContext,
  ): Promise<{
    skuMatch: boolean;
    resolvedSkuId: string | null;
    qtyMatch: boolean | null;
  }> {
    const resolvedSkuId = await this.skus.resolveBarcode(ctx.tenantId, input.barcode.trim());
    const skuMatch = resolvedSkuId !== null && resolvedSkuId === input.expectedSkuId;
    const qtyMatch =
      input.expectedQty !== undefined && input.countedQty !== undefined
        ? Number(input.expectedQty) === Number(input.countedQty)
        : null;
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'ver.material_check',
      objectType: 'Sku',
      objectId: input.expectedSkuId,
      source: 'api',
      newValues: {
        barcode: input.barcode.trim(),
        resolvedSkuId,
        skuMatch,
        qtyMatch,
      },
    });
    return { skuMatch, resolvedSkuId, qtyMatch };
  }

  /**
   * Worker check (VER-005): verify a scanned worker badge maps to an
   * active user of this tenant. Audited pass/fail.
   */
  async workerCheck(
    input: { idpSubject: string },
    ctx: RequestContext,
  ): Promise<{ ok: boolean; displayName: string | null }> {
    const user = await this.prisma.user.findFirst({
      where: { tenantId: ctx.tenantId, idpSubject: input.idpSubject.trim() },
    });
    const ok = user !== null && user.status === 'ACTIVE';
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'ver.worker_check',
      objectType: 'User',
      objectId: user?.id ?? input.idpSubject.trim(),
      source: 'api',
      newValues: { ok, idpSubject: input.idpSubject.trim() },
    });
    return { ok, displayName: user?.displayName ?? null };
  }

  /**
   * Work-order check (VER-006): a scanned WO number must exist and,
   * when an expected status is given, be in it. Audited.
   */
  async workOrderCheck(
    input: { woNumber: string; expectedStatus?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ ok: boolean; status: string | null }> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { tenantId: ctx.tenantId, woNumber: input.woNumber.trim() },
    });
    const ok =
      wo !== null && (input.expectedStatus === undefined || wo.status === input.expectedStatus);
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'ver.work_order_check',
      objectType: 'WorkOrder',
      objectId: wo?.id ?? input.woNumber.trim(),
      source: 'api',
      newValues: { ok, expectedStatus: input.expectedStatus ?? null, status: wo?.status ?? null },
    });
    return { ok, status: wo?.status ?? null };
  }

  /**
   * Location check (VER-010): a scanned bin code must exist in the
   * given warehouse. Audited.
   */
  async locationCheck(
    input: { warehouseId: string; code: string },
    ctx: RequestContext,
  ): Promise<{ ok: boolean; locationId: string | null }> {
    const location = await this.prisma.warehouseLocation.findFirst({
      where: { tenantId: ctx.tenantId, warehouseId: input.warehouseId, code: input.code.trim() },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'ver.location_check',
      objectType: 'WarehouseLocation',
      objectId: location?.id ?? input.code.trim(),
      source: 'api',
      newValues: { ok: location !== null, warehouseId: input.warehouseId },
    });
    return { ok: location !== null, locationId: location?.id ?? null };
  }

  /**
   * Sequence check (VER-012): the operation an operator is about to
   * work must be the next unfinished one on its work order — earlier
   * steps first, always. Audited.
   */
  async sequenceCheck(
    input: { workOrderId: string; operationId: string },
    ctx: RequestContext,
  ): Promise<{ ok: boolean; expectedSeq: number | null; scannedSeq: number | null }> {
    const operations = await this.prisma.workOrderOperation.findMany({
      where: { tenantId: ctx.tenantId, workOrderId: input.workOrderId },
      orderBy: [{ seq: 'asc' }],
    });
    const nextPending = operations.find((o) => o.status !== 'DONE');
    const scanned = operations.find((o) => o.id === input.operationId);
    const ok = nextPending !== undefined && scanned !== undefined && nextPending.id === scanned.id;
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'ver.sequence_check',
      objectType: 'WorkOrder',
      objectId: input.workOrderId,
      source: 'api',
      newValues: {
        ok,
        expectedSeq: nextPending?.seq ?? null,
        scannedSeq: scanned?.seq ?? null,
      },
    });
    return { ok, expectedSeq: nextPending?.seq ?? null, scannedSeq: scanned?.seq ?? null };
  }

  async listEvents(
    filter: { deviceId?: string | undefined },
    ctx: RequestContext,
  ): Promise<ScanEventView[]> {
    const events = await this.prisma.scanEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(filter.deviceId ? { deviceId: filter.deviceId } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });
    return events.map((e) => ({
      id: e.id,
      deviceId: e.deviceId,
      kind: e.kind,
      value: e.value,
      clientEventId: e.clientEventId,
      capturedAt: e.capturedAt.toISOString(),
      receivedAt: e.receivedAt.toISOString(),
      correlationId: e.correlationId,
      resolvedSkuId: e.resolvedSkuId,
    }));
  }
}

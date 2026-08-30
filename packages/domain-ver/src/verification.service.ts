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

  /** Permission: verification.audit. Newest first. */
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

import { randomBytes } from 'node:crypto';
import { writeAudit } from '@nexora/audit';
import type { DeviceStatus, DeviceType, Prisma, PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * DEV domain — device registry, enrollment, assignment and health
 * (DEV-001..DEV-004, VER-019 capability detection).
 *
 * Hardware specifics stay behind adapters on the device side; the platform
 * stores identity, capabilities and liveness only. Business logic never
 * binds to a hardware model (Sprint 005 rule).
 */

export interface DeviceView {
  id: string;
  code: string;
  name: string;
  deviceType: DeviceType;
  status: DeviceStatus;
  assignedUserId: string | null;
  branchId: string | null;
  lastSeenAt: string | null;
}

/** Cross-domain contract used by VER to authenticate device-originated events. */
export interface DeviceGate {
  resolveByToken(
    enrollmentToken: string,
  ): Promise<{ deviceId: string; tenantId: string; active: boolean } | null>;
}

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function toView(d: {
  id: string;
  code: string;
  name: string;
  deviceType: DeviceType;
  status: DeviceStatus;
  assignedUserId: string | null;
  branchId: string | null;
  lastSeenAt: Date | null;
}): DeviceView {
  return {
    id: d.id,
    code: d.code,
    name: d.name,
    deviceType: d.deviceType,
    status: d.status,
    assignedUserId: d.assignedUserId,
    branchId: d.branchId,
    lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
  };
}

export class DeviceService implements DeviceGate {
  constructor(private readonly prisma: PrismaClient) {}

  /** Permission: device.read. */
  async listDevices(ctx: RequestContext): Promise<DeviceView[]> {
    const devices = await this.prisma.device.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { code: 'asc' },
      take: 200,
    });
    return devices.map(toView);
  }

  /**
   * Permission: device.enroll. Registers the device and returns the one-time
   * enrollment token — shown once, never listed again.
   */
  async registerDevice(
    input: { code: string; name: string; deviceType: DeviceType },
    ctx: RequestContext,
  ): Promise<DeviceView & { enrollmentToken: string }> {
    if (!CODE_RE.test(input.code)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid device code');
    }
    const enrollmentToken = randomBytes(24).toString('base64url');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.device.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } },
      });
      if (existing) throw new DomainError('CONFLICT', 'A device with this code already exists');
      const device = await tx.device.create({
        data: {
          tenantId: ctx.tenantId,
          code: input.code,
          name: input.name,
          deviceType: input.deviceType,
          enrollmentToken,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'device.register',
        objectType: 'Device',
        objectId: device.id,
        source: 'api',
        newValues: { code: device.code, deviceType: device.deviceType },
      });
      return { ...toView(device), enrollmentToken };
    });
  }

  /**
   * Device-side enrollment (no user session): the physical device presents
   * its one-time token and reports detected capabilities (VER-019).
   * Emits device.enrolled.
   */
  async enrollDevice(
    enrollmentToken: string,
    capabilities?: Record<string, unknown>,
  ): Promise<{ deviceId: string; tenantId: string; code: string }> {
    const device = await this.prisma.device.findUnique({ where: { enrollmentToken } });
    if (!device) throw new DomainError('UNAUTHENTICATED', 'Unknown enrollment token');
    if (device.status === 'SUSPENDED') {
      throw new DomainError('FORBIDDEN', 'This device has been revoked');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: device.id },
        data: {
          status: 'ACTIVE',
          lastSeenAt: new Date(),
          ...(capabilities !== undefined
            ? { capabilities: capabilities as Prisma.InputJsonValue }
            : {}),
        },
      });
      await writeAudit(tx, {
        tenantId: device.tenantId,
        actorType: 'SERVICE',
        actorId: undefined,
        action: 'device.enroll',
        objectType: 'Device',
        objectId: device.id,
        source: 'device',
        newValues: { code: device.code },
      });
      await publishToOutbox(tx, {
        tenantId: device.tenantId,
        eventType: EVENT_TYPES.DEVICE_ENROLLED,
        aggregateType: 'Device',
        aggregateId: device.id,
        actorType: 'SERVICE',
        actorId: undefined,
        payload: { deviceId: device.id, code: device.code },
      });
    });
    return { deviceId: device.id, tenantId: device.tenantId, code: device.code };
  }

  /** Device liveness ping (DEV-004). Authenticated by enrollment token. */
  async heartbeat(enrollmentToken: string): Promise<{ ok: true }> {
    const device = await this.prisma.device.findUnique({ where: { enrollmentToken } });
    if (!device || device.status === 'SUSPENDED') {
      throw new DomainError('UNAUTHENTICATED', 'Unknown or revoked device');
    }
    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });
    return { ok: true };
  }

  /** Permission: device.assign. */
  async assignDevice(
    input: { deviceId: string; userId?: string | undefined; branchId?: string | undefined },
    ctx: RequestContext,
  ): Promise<DeviceView> {
    return this.prisma.$transaction(async (tx) => {
      const device = await tx.device.findFirst({
        where: { id: input.deviceId, tenantId: ctx.tenantId },
      });
      if (!device) throw notFound('Device', input.deviceId);
      const updated = await tx.device.update({
        where: { id: device.id },
        data: { assignedUserId: input.userId ?? null, branchId: input.branchId ?? null },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'device.assign',
        objectType: 'Device',
        objectId: device.id,
        source: 'api',
        newValues: { userId: input.userId ?? null, branchId: input.branchId ?? null },
      });
      return toView(updated);
    });
  }

  /** Permission: device.revoke. A suspended device can no longer authenticate. */
  async revokeDevice(deviceId: string, reason: string, ctx: RequestContext): Promise<DeviceView> {
    return this.prisma.$transaction(async (tx) => {
      const device = await tx.device.findFirst({ where: { id: deviceId, tenantId: ctx.tenantId } });
      if (!device) throw notFound('Device', deviceId);
      const updated = await tx.device.update({
        where: { id: device.id },
        data: { status: 'SUSPENDED' },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'device.revoke',
        objectType: 'Device',
        objectId: device.id,
        source: 'api',
        newValues: { reason },
      });
      return toView(updated);
    });
  }

  /**
   * Scanner configuration (DEV-005): governed update of a device's
   * declared capabilities — symbologies, prefixes, mode — audited
   * with before/after; hardware specifics stay data, never code.
   */
  async setCapabilities(
    deviceId: string,
    capabilities: Record<string, unknown>,
    ctx: RequestContext,
  ): Promise<DeviceView> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId: ctx.tenantId },
    });
    if (!device) throw notFound('Device', deviceId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.device.update({
        where: { id: device.id },
        data: { capabilities: capabilities as Prisma.InputJsonValue },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'dev.device.capabilities',
        objectType: 'Device',
        objectId: device.id,
        source: 'api',
        previousValues: { capabilities: device.capabilities as Prisma.InputJsonValue },
        newValues: { capabilities: capabilities as Prisma.InputJsonValue },
      });
      return row;
    });
    return toView(updated);
  }

  /**
   * Device event audit (DEV-015): one chronological trail per device —
   * captured scan events plus every audited device action (prints,
   * weights, enrollment, capability changes).
   */
  async deviceEventAudit(
    deviceId: string,
    ctx: RequestContext,
  ): Promise<Array<{ at: string; kind: string; detail: string }>> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!device) throw notFound('Device', deviceId);
    const [scans, audits] = await Promise.all([
      this.prisma.scanEvent.findMany({
        where: { tenantId: ctx.tenantId, deviceId: device.id },
        orderBy: { capturedAt: 'desc' },
        take: 100,
      }),
      this.prisma.auditEvent.findMany({
        where: {
          tenantId: ctx.tenantId,
          action: { startsWith: 'dev.' },
          OR: [{ objectId: device.id }, { objectId: { startsWith: `${device.id}:` } }],
        },
        orderBy: { occurredAt: 'desc' },
        take: 100,
      }),
    ]);
    const rows = [
      ...scans.map((event) => ({
        at: event.capturedAt.toISOString(),
        kind: `scan:${event.kind}`,
        detail: event.value,
      })),
      ...audits.map((event) => ({
        at: event.occurredAt.toISOString(),
        kind: event.action,
        detail: event.objectId,
      })),
    ];
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 150);
  }

  /** DeviceGate — used by VER through the public interface only. */
  async resolveByToken(
    enrollmentToken: string,
  ): Promise<{ deviceId: string; tenantId: string; active: boolean } | null> {
    const device = await this.prisma.device.findUnique({ where: { enrollmentToken } });
    if (!device) return null;
    return {
      deviceId: device.id,
      tenantId: device.tenantId,
      active: device.status === 'ACTIVE',
    };
  }
}

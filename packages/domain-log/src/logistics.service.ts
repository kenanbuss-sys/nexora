import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * LOG — logistics & transport. Shipment planning (LOG-001), carrier
 * management via configuration (LOG-002), fleet & drivers
 * (LOG-004/005), route stops (LOG-006), dispatch and track & trace
 * (LOG-008/009). Shipments never carry stock truth; they carry what
 * moves, with whom, and where it stands.
 *
 * PLANNED → DISPATCHED → IN_TRANSIT → DELIVERED
 * any non-terminal → EXCEPTION (reasoned) → IN_TRANSIT (resumed)
 */

export type ShipmentStatus = 'PLANNED' | 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'EXCEPTION';

export interface ShipmentView {
  id: string;
  shipmentNumber: string;
  status: ShipmentStatus;
  carrierKey: string | null;
  vehicleId: string | null;
  driverId: string | null;
  plannedAt: string | null;
  deliveredAt: string | null;
  freightCost: string | null;
  stops: Array<{
    id: string;
    seq: number;
    address: string;
    status: string;
    orderId: string | null;
  }>;
}

/** Cross-domain contract: tenant configuration (owned by core). */
export interface LogisticsConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
}

const TRANSITIONS: Record<string, ShipmentStatus[]> = {
  PLANNED: ['DISPATCHED'],
  DISPATCHED: ['IN_TRANSIT', 'EXCEPTION'],
  IN_TRANSIT: ['DELIVERED', 'EXCEPTION'],
  EXCEPTION: ['IN_TRANSIT'],
  DELIVERED: [],
};

function toView(row: {
  id: string;
  shipmentNumber: string;
  status: string;
  carrierKey: string | null;
  vehicleId: string | null;
  driverId: string | null;
  plannedAt: Date | null;
  deliveredAt: Date | null;
  freightCost: unknown;
  stops: Array<{
    id: string;
    seq: number;
    address: string;
    status: string;
    orderId: string | null;
  }>;
}): ShipmentView {
  return {
    id: row.id,
    shipmentNumber: row.shipmentNumber,
    status: row.status as ShipmentStatus,
    carrierKey: row.carrierKey,
    vehicleId: row.vehicleId,
    driverId: row.driverId,
    plannedAt: row.plannedAt ? row.plannedAt.toISOString() : null,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    freightCost: row.freightCost === null ? null : String(row.freightCost),
    stops: row.stops
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((stop) => ({
        id: stop.id,
        seq: stop.seq,
        address: stop.address,
        status: stop.status,
        orderId: stop.orderId,
      })),
  };
}

export class LogisticsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration?: LogisticsConfigGate,
  ) {}

  // ------------------------------------------------------------ fleet

  async createVehicle(
    input: { plate: string; name: string; capacityKg?: number | undefined },
    ctx: RequestContext,
  ): Promise<{ id: string; plate: string }> {
    const plate = input.plate.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,16}$/.test(plate)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid plate');
    }
    try {
      const vehicle = await this.prisma.vehicle.create({
        data: {
          tenantId: ctx.tenantId,
          plate,
          name: input.name.trim(),
          capacityKg: input.capacityKg ?? 0,
        },
      });
      return { id: vehicle.id, plate: vehicle.plate };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', `Vehicle ${plate} already exists`);
      }
      throw error;
    }
  }

  async listVehicles(
    ctx: RequestContext,
  ): Promise<
    Array<{ id: string; plate: string; name: string; capacityKg: string; active: boolean }>
  > {
    const rows = await this.prisma.vehicle.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { plate: 'asc' },
      take: 200,
    });
    return rows.map((v) => ({
      id: v.id,
      plate: v.plate,
      name: v.name,
      capacityKg: v.capacityKg.toString(),
      active: v.active,
    }));
  }

  async createDriver(
    input: { name: string; licenseNo?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ id: string; name: string }> {
    if (input.name.trim().length < 2) {
      throw new DomainError('VALIDATION_FAILED', 'Driver name is required');
    }
    const driver = await this.prisma.driver.create({
      data: { tenantId: ctx.tenantId, name: input.name.trim(), licenseNo: input.licenseNo ?? null },
    });
    return { id: driver.id, name: driver.name };
  }

  async listDrivers(
    ctx: RequestContext,
  ): Promise<Array<{ id: string; name: string; licenseNo: string | null; active: boolean }>> {
    const rows = await this.prisma.driver.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: 'asc' },
      take: 200,
    });
    return rows.map((d) => ({ id: d.id, name: d.name, licenseNo: d.licenseNo, active: d.active }));
  }

  // ------------------------------------------------------- carriers

  /** LOG-002: carriers are configuration, validated on use. */
  private async carrierKeys(tenantId: string): Promise<Set<string>> {
    if (!this.configuration) return new Set();
    try {
      const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
      const log = ((config as Record<string, unknown>).log ?? {}) as Record<string, unknown>;
      const carriers = Array.isArray(log.carriers) ? log.carriers : [];
      return new Set(
        carriers
          .map((c) => (c as { key?: unknown }).key)
          .filter((k): k is string => typeof k === 'string'),
      );
    } catch {
      return new Set();
    }
  }

  // ------------------------------------------------------ shipments

  async createShipment(
    input: {
      carrierKey?: string | undefined;
      vehicleId?: string | undefined;
      driverId?: string | undefined;
      plannedAt?: string | undefined;
      stops: Array<{ address: string; orderId?: string | undefined }>;
    },
    ctx: RequestContext,
  ): Promise<ShipmentView> {
    if (input.stops.length === 0 || input.stops.length > 100) {
      throw new DomainError('VALIDATION_FAILED', 'A shipment needs 1..100 stops');
    }
    if (input.carrierKey !== undefined) {
      const carriers = await this.carrierKeys(ctx.tenantId);
      if (!carriers.has(input.carrierKey)) {
        throw new DomainError('VALIDATION_FAILED', `Unknown carrier '${input.carrierKey}'`);
      }
    }
    if (input.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, tenantId: ctx.tenantId, active: true },
      });
      if (!vehicle) throw notFound('Vehicle', input.vehicleId);
    }
    if (input.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: input.driverId, tenantId: ctx.tenantId, active: true },
      });
      if (!driver) throw notFound('Driver', input.driverId);
    }
    for (const stop of input.stops) {
      if (stop.orderId) {
        const order = await this.prisma.salesOrder.findFirst({
          where: { id: stop.orderId, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!order) throw notFound('SalesOrder', stop.orderId);
      }
    }
    const shipment = await this.prisma.$transaction(async (tx) => {
      const count = await tx.shipment.count({ where: { tenantId: ctx.tenantId } });
      const created = await tx.shipment.create({
        data: {
          tenantId: ctx.tenantId,
          shipmentNumber: `SHP-${String(count + 1).padStart(6, '0')}`,
          carrierKey: input.carrierKey ?? null,
          vehicleId: input.vehicleId ?? null,
          driverId: input.driverId ?? null,
          plannedAt: input.plannedAt ? new Date(input.plannedAt) : null,
          createdBy: ctx.userId ?? null,
          stops: {
            create: input.stops.map((stop, index) => ({
              tenantId: ctx.tenantId,
              seq: index + 1,
              address: stop.address.trim(),
              orderId: stop.orderId ?? null,
            })),
          },
        },
        include: { stops: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'log.shipment.create',
        objectType: 'Shipment',
        objectId: created.id,
        source: 'api',
        newValues: { shipmentNumber: created.shipmentNumber, stops: input.stops.length },
      });
      return created;
    });
    return toView(shipment);
  }

  async listShipments(
    filter: { status?: ShipmentStatus | undefined },
    ctx: RequestContext,
  ): Promise<ShipmentView[]> {
    const rows = await this.prisma.shipment.findMany({
      where: { tenantId: ctx.tenantId, ...(filter.status ? { status: filter.status } : {}) },
      include: { stops: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toView);
  }

  async getShipment(shipmentId: string, ctx: RequestContext): Promise<ShipmentView> {
    const row = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId: ctx.tenantId },
      include: { stops: true },
    });
    if (!row) throw notFound('Shipment', shipmentId);
    return toView(row);
  }

  /** LOG-008: dispatch needs transport — own fleet or a carrier. */
  async transition(
    shipmentId: string,
    to: ShipmentStatus,
    input: { reason?: string | undefined },
    ctx: RequestContext,
  ): Promise<ShipmentView> {
    const row = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId: ctx.tenantId },
      include: { stops: true },
    });
    if (!row) throw notFound('Shipment', shipmentId);
    if (!(TRANSITIONS[row.status] ?? []).includes(to)) {
      throw new DomainError('INVALID_STATE', `Cannot move a ${row.status} shipment to ${to}`);
    }
    if (to === 'DISPATCHED' && !row.carrierKey && !(row.vehicleId && row.driverId)) {
      throw new DomainError(
        'INVALID_STATE',
        'Dispatch needs a carrier, or a vehicle with a driver',
      );
    }
    if (to === 'EXCEPTION' && !(input.reason && input.reason.trim().length >= 5)) {
      throw new DomainError('VALIDATION_FAILED', 'Exceptions need a substantive reason');
    }
    if (to === 'DELIVERED' && row.stops.some((stop) => stop.status === 'PENDING')) {
      throw new DomainError('INVALID_STATE', 'All stops must be handled before delivery');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.shipment.update({
        where: { id: row.id },
        data: { status: to, ...(to === 'DELIVERED' ? { deliveredAt: new Date() } : {}) },
        include: { stops: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'log.shipment.transition',
        objectType: 'Shipment',
        objectId: row.id,
        source: 'api',
        previousValues: { status: row.status },
        newValues: { status: to },
        ...(input.reason ? { reason: input.reason.trim() } : {}),
      });
      return changed;
    });
    return toView(updated);
  }

  /** LOG-006/009: stop progress is the trace. */
  async completeStop(
    input: {
      shipmentId: string;
      stopId: string;
      failed?: boolean | undefined;
      note?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<ShipmentView> {
    const row = await this.prisma.shipment.findFirst({
      where: { id: input.shipmentId, tenantId: ctx.tenantId },
      include: { stops: true },
    });
    if (!row) throw notFound('Shipment', input.shipmentId);
    if (row.status !== 'IN_TRANSIT') {
      throw new DomainError('INVALID_STATE', 'Stops complete only while in transit');
    }
    const stop = row.stops.find((s) => s.id === input.stopId);
    if (!stop) throw notFound('ShipmentStop', input.stopId);
    if (stop.status !== 'PENDING') {
      throw new DomainError('INVALID_STATE', 'The stop is already handled');
    }
    const earlier = row.stops.some((s) => s.seq < stop.seq && s.status === 'PENDING');
    if (earlier) {
      throw new DomainError('INVALID_STATE', 'Earlier stops must be handled first');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.shipmentStop.update({
        where: { id: stop.id },
        data: {
          status: input.failed ? 'FAILED' : 'DONE',
          note: input.note ?? null,
          arrivedAt: new Date(),
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'log.stop.complete',
        objectType: 'ShipmentStop',
        objectId: stop.id,
        source: 'api',
        newValues: { seq: stop.seq, failed: input.failed === true, note: input.note ?? null },
      });
    });
    return this.getShipment(row.id, ctx);
  }
}

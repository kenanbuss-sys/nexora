import { writeAudit } from '@nexora/audit';
import type { PrismaClient, StockMovementType } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * WMS — inventory truth (WMS-*): warehouse topology, IMMUTABLE movement
 * ledger and atomic reservations.
 *
 * Stock truth is the sum of movements; corrections are reversal movements.
 * Reservations enforce the availability policy atomically under a
 * per-(tenant, warehouse, sku) advisory lock — "read available, write later"
 * without a lock is forbidden (docs/architecture/08_CONCURRENCY_IDEMPOTENCY.md).
 */

export interface WarehouseView {
  id: string;
  code: string;
  name: string;
}

export interface StockPosition {
  warehouseId: string;
  skuId: string;
  onHand: string;
  reserved: string;
  available: string;
}

export interface MovementInput {
  warehouseId: string;
  skuId: string;
  movementType: StockMovementType;
  quantity: number;
  idempotencyKey: string;
  locationId?: string | undefined;
  reason?: string | undefined;
}

/** Cross-domain gate: SKU identity is owned by PIM (public contract only). */
export interface SkuGate {
  getSkuState(tenantId: string, skuId: string): Promise<{ exists: boolean; active: boolean }>;
}

const OUTBOUND: ReadonlySet<StockMovementType> = new Set([
  'ISSUE',
  'ADJUSTMENT_OUT',
  'TRANSFER_OUT',
]);

export class InventoryService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly skuGate: SkuGate,
  ) {}

  /** Permission: inventory.read. */
  async listWarehouses(ctx: RequestContext): Promise<WarehouseView[]> {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { code: 'asc' },
      take: 200,
    });
    return warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name }));
  }

  /** Permission: inventory.read. Recent ledger entries, newest first. */
  async listMovements(
    filter: { warehouseId?: string | undefined; skuId?: string | undefined },
    ctx: RequestContext,
  ): Promise<
    Array<{
      id: string;
      warehouseId: string;
      skuId: string;
      movementType: string;
      quantity: string;
      reason: string | null;
      idempotencyKey: string;
      occurredAt: string;
    }>
  > {
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
        ...(filter.skuId ? { skuId: filter.skuId } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
    return movements.map((m) => ({
      id: m.id,
      warehouseId: m.warehouseId,
      skuId: m.skuId,
      movementType: m.movementType,
      quantity: m.quantity.toString(),
      reason: m.reason,
      idempotencyKey: m.idempotencyKey,
      occurredAt: m.occurredAt.toISOString(),
    }));
  }

  /** Permission: inventory.read. */
  async listReservations(
    filter: { warehouseId?: string | undefined; skuId?: string | undefined },
    ctx: RequestContext,
  ): Promise<
    Array<{
      id: string;
      warehouseId: string;
      skuId: string;
      quantity: string;
      status: string;
      reference: string | null;
      createdAt: string;
    }>
  > {
    const reservations = await this.prisma.stockReservation.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
        ...(filter.skuId ? { skuId: filter.skuId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return reservations.map((r) => ({
      id: r.id,
      warehouseId: r.warehouseId,
      skuId: r.skuId,
      quantity: r.quantity.toString(),
      status: r.status,
      reference: r.reference,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createWarehouse(
    input: { code: string; name: string },
    ctx: RequestContext,
  ): Promise<WarehouseView> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(input.code)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid warehouse code');
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.warehouse.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } },
      });
      if (existing) throw new DomainError('CONFLICT', 'Warehouse code already exists');
      const warehouse = await tx.warehouse.create({
        data: { tenantId: ctx.tenantId, code: input.code, name: input.name.trim() },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'warehouse.create',
        objectType: 'Warehouse',
        objectId: warehouse.id,
        source: 'api',
        newValues: { code: warehouse.code, name: warehouse.name },
      });
      return { id: warehouse.id, code: warehouse.code, name: warehouse.name };
    });
  }

  async createLocation(
    input: { warehouseId: string; code: string },
    ctx: RequestContext,
  ): Promise<{ id: string; code: string }> {
    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: input.warehouseId, tenantId: ctx.tenantId },
      });
      if (!warehouse) throw notFound('Warehouse', input.warehouseId);
      const location = await tx.warehouseLocation.create({
        data: { tenantId: ctx.tenantId, warehouseId: warehouse.id, code: input.code },
      });
      return { id: location.id, code: location.code };
    });
  }

  /**
   * Post an immutable ledger movement. Idempotent per (tenant, idempotencyKey):
   * a duplicate submission returns the original movement with `duplicate: true`
   * and produces exactly one stock effect. Outbound movements cannot drive
   * on-hand negative (checked under the stock lock).
   */
  async postMovement(
    input: MovementInput,
    ctx: RequestContext,
  ): Promise<{ movementId: string; duplicate: boolean }> {
    if (!(input.quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) {
      throw new DomainError('VALIDATION_FAILED', 'idempotencyKey must be 8-128 chars');
    }
    const sku = await this.skuGate.getSkuState(ctx.tenantId, input.skuId);
    if (!sku.exists) throw notFound('Sku', input.skuId);
    if (!sku.active && input.movementType === 'RECEIPT') {
      throw new DomainError('INVALID_STATE', 'Inactive SKU cannot be newly transacted');
    }

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: input.warehouseId, tenantId: ctx.tenantId },
      });
      if (!warehouse) throw notFound('Warehouse', input.warehouseId);

      const existing = await tx.stockMovement.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: ctx.tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return { movementId: existing.id, duplicate: true };

      await this.lockStock(tx, ctx.tenantId, input.warehouseId, input.skuId);

      if (OUTBOUND.has(input.movementType)) {
        const { onHand } = await this.sums(tx, ctx.tenantId, input.warehouseId, input.skuId);
        if (onHand < input.quantity) {
          throw new DomainError('INVALID_STATE', 'Insufficient on-hand stock', {
            onHand: onHand.toString(),
            requested: input.quantity.toString(),
          });
        }
      }

      const movement = await tx.stockMovement.create({
        data: {
          tenantId: ctx.tenantId,
          warehouseId: input.warehouseId,
          locationId: input.locationId ?? null,
          skuId: input.skuId,
          movementType: input.movementType,
          quantity: input.quantity,
          reason: input.reason ?? null,
          idempotencyKey: input.idempotencyKey,
          createdBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'stock.move',
        objectType: 'StockMovement',
        objectId: movement.id,
        source: 'api',
        newValues: {
          movementType: input.movementType,
          quantity: input.quantity,
          skuId: input.skuId,
        },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.STOCK_MOVED,
        aggregateType: 'StockMovement',
        aggregateId: movement.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: {
          movementId: movement.id,
          skuId: input.skuId,
          quantity: input.quantity,
          from: OUTBOUND.has(input.movementType) ? input.warehouseId : null,
          to: OUTBOUND.has(input.movementType) ? null : input.warehouseId,
        },
      });
      return { movementId: movement.id, duplicate: false };
    });
  }

  /**
   * Reserve stock atomically: available = onHand - activeReservations must
   * cover the quantity, checked and written under the stock lock so
   * concurrent reservations can never oversell.
   */
  async reserveStock(
    input: { warehouseId: string; skuId: string; quantity: number; reference?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ reservationId: string }> {
    if (!(input.quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: input.warehouseId, tenantId: ctx.tenantId },
      });
      if (!warehouse) throw notFound('Warehouse', input.warehouseId);

      await this.lockStock(tx, ctx.tenantId, input.warehouseId, input.skuId);
      const { onHand, reserved } = await this.sums(
        tx,
        ctx.tenantId,
        input.warehouseId,
        input.skuId,
      );
      const available = onHand - reserved;
      if (available < input.quantity) {
        throw new DomainError('INVALID_STATE', 'Insufficient available stock', {
          available: available.toString(),
          requested: input.quantity.toString(),
        });
      }
      const reservation = await tx.stockReservation.create({
        data: {
          tenantId: ctx.tenantId,
          warehouseId: input.warehouseId,
          skuId: input.skuId,
          quantity: input.quantity,
          reference: input.reference ?? null,
        },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.STOCK_RESERVED,
        aggregateType: 'StockReservation',
        aggregateId: reservation.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: {
          reservationId: reservation.id,
          skuId: input.skuId,
          quantity: input.quantity,
          locationScope: input.warehouseId,
        },
      });
      return { reservationId: reservation.id };
    });
  }

  async releaseReservation(reservationId: string, ctx: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.stockReservation.findFirst({
        where: { id: reservationId, tenantId: ctx.tenantId },
      });
      if (!reservation) throw notFound('StockReservation', reservationId);
      const updated = await tx.stockReservation.updateMany({
        where: { id: reservation.id, status: 'ACTIVE' },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new DomainError('INVALID_STATE', `Reservation is already ${reservation.status}`);
      }
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.STOCK_RELEASED,
        aggregateType: 'StockReservation',
        aggregateId: reservation.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { reservationId: reservation.id },
      });
    });
  }

  /** Derived projection: on hand / reserved / available from the ledger. */
  async getStockPosition(
    warehouseId: string,
    skuId: string,
    ctx: RequestContext,
  ): Promise<StockPosition> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId: ctx.tenantId },
    });
    if (!warehouse) throw notFound('Warehouse', warehouseId);
    const { onHand, reserved } = await this.sums(this.prisma, ctx.tenantId, warehouseId, skuId);
    return {
      warehouseId,
      skuId,
      onHand: onHand.toString(),
      reserved: reserved.toString(),
      available: (onHand - reserved).toString(),
    };
  }

  /** Per-(tenant, warehouse, sku) transaction-scoped advisory lock. */
  private async lockStock(
    tx: { $executeRaw: PrismaClient['$executeRaw'] },
    tenantId: string,
    warehouseId: string,
    skuId: string,
  ): Promise<void> {
    const key = `${tenantId}:${warehouseId}:${skuId}`;
    // $executeRaw (not $queryRaw): pg_advisory_xact_lock returns VOID, which
    // the engine-free client cannot deserialize as a result column.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  private async sums(
    db: { $queryRaw: PrismaClient['$queryRaw'] },
    tenantId: string,
    warehouseId: string,
    skuId: string,
  ): Promise<{ onHand: number; reserved: number }> {
    const rows = await db.$queryRaw<Array<{ on_hand: string | null; reserved: string | null }>>`
      SELECT
        (SELECT COALESCE(SUM(CASE WHEN movement_type IN ('RECEIPT','ADJUSTMENT_IN','TRANSFER_IN')
                                  THEN quantity ELSE -quantity END), 0)
           FROM "stock_movement"
          WHERE tenant_id = ${tenantId}::uuid
            AND warehouse_id = ${warehouseId}::uuid
            AND sku_id = ${skuId}::uuid) AS on_hand,
        (SELECT COALESCE(SUM(quantity), 0)
           FROM "stock_reservation"
          WHERE tenant_id = ${tenantId}::uuid
            AND warehouse_id = ${warehouseId}::uuid
            AND sku_id = ${skuId}::uuid
            AND status = 'ACTIVE') AS reserved`;
    const row = rows[0];
    return { onHand: Number(row?.on_hand ?? 0), reserved: Number(row?.reserved ?? 0) };
  }
}

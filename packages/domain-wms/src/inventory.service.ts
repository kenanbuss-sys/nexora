import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient, StockMovementType } from '@nexora/db';
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
  /** Sprint 022 (WMS-017): lot dimension. */
  lotNumber?: string | undefined;
  expiresAt?: Date | undefined;
  /** Sprint 239 (WMS-018): serialised units moved by this movement. */
  serials?: string[] | undefined;
  /**
   * Sprint 240 (PIM-007): UOM the quantity was entered in. Converted to
   * the SKU's base UOM server-side; the ledger always books base units.
   */
  uom?: string | undefined;
}

export interface LotBalance {
  lotNumber: string;
  onHand: string;
  expiresAt: string | null;
  expired: boolean;
  expiringSoon: boolean;
}

/** Cross-domain gate: SKU identity and lot policy are owned by PIM. */
export interface SkuGate {
  getSkuState(
    tenantId: string,
    skuId: string,
  ): Promise<{
    exists: boolean;
    active: boolean;
    lotTracked?: boolean;
    shelfLifeDays?: number | null;
    /** Sprint 239 (WMS-018): NONE | OPTIONAL | REQUIRED. */
    serialPolicy?: string;
  }>;
  /** Sprint 240 (PIM-007): entered UOM -> base UOM, exact or refused. */
  toBaseQuantity?(
    tenantId: string,
    skuId: string,
    uom: string,
    quantity: number,
  ): Promise<{ baseQuantity: number; baseUom: string; factor: string }>;
}

const SERIAL_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/;

/**
 * WMS-018: validates the serials of a movement against the SKU policy
 * BEFORE any write. REQUIRED → exactly `quantity` unique serials (whole
 * units); OPTIONAL → same rules when given; NONE → none allowed.
 */
export function validateSerials(
  policy: string | undefined,
  quantity: number,
  serials: string[] | undefined,
): string[] | null {
  const list = (serials ?? []).map((v) => v.trim()).filter((v) => v.length > 0);
  if (!policy || policy === 'NONE') {
    if (list.length) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'This SKU is not serial-tracked — remove the serial numbers',
      );
    }
    return null;
  }
  if (!list.length) {
    if (policy === 'REQUIRED') {
      throw new DomainError(
        'VALIDATION_FAILED',
        'This SKU requires serial numbers — scan or enter one serial per unit',
      );
    }
    return null;
  }
  if (!Number.isInteger(quantity)) {
    throw new DomainError('VALIDATION_FAILED', 'Serial-tracked quantities must be whole units');
  }
  if (list.length !== quantity) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `Expected ${quantity} serial number(s), got ${list.length}`,
    );
  }
  const bad = list.find((v) => !SERIAL_RE.test(v));
  if (bad) throw new DomainError('VALIDATION_FAILED', `Invalid serial number '${bad}'`);
  const unique = new Set(list);
  if (unique.size !== list.length) {
    throw new DomainError('VALIDATION_FAILED', 'A serial number is listed twice');
  }
  return [...unique].sort();
}

const INBOUND: ReadonlySet<StockMovementType> = new Set([
  'RECEIPT',
  'ADJUSTMENT_IN',
  'TRANSFER_IN',
]);

const OUTBOUND: ReadonlySet<StockMovementType> = new Set([
  'ISSUE',
  'ADJUSTMENT_OUT',
  'TRANSFER_OUT',
]);

/** Quarantine holds subtract from what may be promised (QMS-006). */
export interface HoldGate {
  activeHeld(tenantId: string, warehouseId: string, skuId: string): Promise<number>;
  activeHeldBySku(tenantId: string, skuIds: string[]): Promise<Map<string, number>>;
}

export class InventoryService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly skuGate: SkuGate,
    private readonly holds?: HoldGate,
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
      enteredUom: string | null;
      enteredQuantity: string | null;
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
      enteredUom: m.enteredUom,
      enteredQuantity: m.enteredQuantity?.toString() ?? null,
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
    // PIM-007: quantities entered in another UOM are converted to base
    // units before any rule (stock check, serial count) is evaluated.
    let entered: { uom: string; quantity: number; factor: string } | null = null;
    if (input.uom !== undefined) {
      if (!this.skuGate.toBaseQuantity) {
        throw new DomainError('VALIDATION_FAILED', 'UOM conversion is not available');
      }
      const conversion = await this.skuGate.toBaseQuantity(
        ctx.tenantId,
        input.skuId,
        input.uom,
        input.quantity,
      );
      if (conversion.baseUom !== input.uom) {
        entered = { uom: input.uom, quantity: input.quantity, factor: conversion.factor };
        input = { ...input, quantity: conversion.baseQuantity };
      }
      if (!(input.quantity > 0)) {
        throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
      }
    }
    let enteredApplied = false;
    const sku = await this.skuGate.getSkuState(ctx.tenantId, input.skuId);
    if (!sku.exists) throw notFound('Sku', input.skuId);
    if (!sku.active && input.movementType === 'RECEIPT') {
      throw new DomainError('INVALID_STATE', 'Inactive SKU cannot be newly transacted');
    }
    const lotTracked = sku.lotTracked === true;
    if (lotTracked && INBOUND.has(input.movementType) && !input.lotNumber) {
      throw new DomainError('VALIDATION_FAILED', 'Lot-tracked SKU needs a lot number on receipt');
    }
    const serials = validateSerials(sku.serialPolicy, input.quantity, input.serials);
    let serialsApplied = false;

    try {
      return await this.prisma.$transaction(async (tx) => {
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

        const writeMovement = async (
          quantity: number,
          idempotencyKey: string,
          lotNumber: string | null,
          expiresAt: Date | null,
        ) => {
          // The entered UOM/quantity describe the request: kept on the
          // first row only (lot splits share it), like serials.
          const enteredHere = entered && !enteredApplied ? entered : null;
          enteredApplied = true;
          const movement = await tx.stockMovement.create({
            data: {
              tenantId: ctx.tenantId,
              warehouseId: input.warehouseId,
              locationId: input.locationId ?? null,
              skuId: input.skuId,
              movementType: input.movementType,
              quantity,
              reason: input.reason ?? null,
              idempotencyKey,
              lotNumber,
              expiresAt,
              createdBy: ctx.userId ?? null,
              enteredUom: enteredHere?.uom ?? null,
              enteredQuantity: enteredHere?.quantity ?? null,
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
              quantity,
              skuId: input.skuId,
              ...(lotNumber ? { lotNumber } : {}),
              ...(enteredHere
                ? {
                    enteredUom: enteredHere.uom,
                    enteredQuantity: enteredHere.quantity,
                    factor: enteredHere.factor,
                  }
                : {}),
            },
          });
          // WMS-018: serial positions move with the FIRST movement row of
          // this request (lot splits share one serial set).
          const movedSerials = serials && !serialsApplied ? serials : null;
          if (movedSerials) {
            await this.applySerials(tx, ctx.tenantId, input, movement.id, movedSerials);
            serialsApplied = true;
          }
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
              quantity,
              lotNumber,
              movementType: input.movementType,
              ...(movedSerials ? { serials: movedSerials } : {}),
              ...(enteredHere
                ? { enteredUom: enteredHere.uom, enteredQuantity: enteredHere.quantity }
                : {}),
              from: OUTBOUND.has(input.movementType) ? input.warehouseId : null,
              to: OUTBOUND.has(input.movementType) ? null : input.warehouseId,
            },
          });
          return movement;
        };

        // Lot handling (WMS-017/019).
        if (lotTracked && OUTBOUND.has(input.movementType)) {
          const balances = await this.lotBalancesInTx(
            tx,
            ctx.tenantId,
            input.warehouseId,
            input.skuId,
          );
          const now = Date.now();
          if (input.lotNumber) {
            const lot = balances.find((b) => b.lotNumber === input.lotNumber);
            const lotOnHand = lot ? Number(lot.onHand) : 0;
            if (lotOnHand < input.quantity) {
              throw new DomainError('INVALID_STATE', 'Insufficient stock in this lot', {
                lot: input.lotNumber,
                onHand: lotOnHand.toString(),
              });
            }
            if (
              lot?.expiresAt &&
              new Date(lot.expiresAt).getTime() < now &&
              input.movementType !== 'ADJUSTMENT_OUT'
            ) {
              throw new DomainError(
                'INVALID_STATE',
                `Lot ${input.lotNumber} is expired — only a write-off (ADJUSTMENT_OUT) may move it`,
              );
            }
            const movement = await writeMovement(
              input.quantity,
              input.idempotencyKey,
              input.lotNumber,
              lot?.expiresAt ? new Date(lot.expiresAt) : null,
            );
            return { movementId: movement.id, duplicate: false };
          }
          // FEFO (WMS-019): earliest expiry first, expired lots skipped
          // unless this is a write-off.
          const usable = balances
            .filter((b) => Number(b.onHand) > 0)
            .filter(
              (b) =>
                input.movementType === 'ADJUSTMENT_OUT' ||
                !b.expiresAt ||
                new Date(b.expiresAt).getTime() >= now,
            )
            .sort((a, z) => {
              if (a.expiresAt === null) return 1;
              if (z.expiresAt === null) return -1;
              return a.expiresAt.localeCompare(z.expiresAt);
            });
          const usableTotal = usable.reduce((sum, b) => sum + Number(b.onHand), 0);
          if (usableTotal < input.quantity) {
            throw new DomainError('INVALID_STATE', 'Insufficient unexpired lot stock', {
              usable: usableTotal.toString(),
              requested: input.quantity.toString(),
            });
          }
          let remaining = input.quantity;
          let firstId: string | null = null;
          let part = 0;
          for (const lot of usable) {
            if (remaining <= 0) break;
            const take = Math.min(Number(lot.onHand), remaining);
            part += 1;
            const key = part === 1 ? input.idempotencyKey : `${input.idempotencyKey}#${part}`;
            const movement = await writeMovement(
              take,
              key,
              lot.lotNumber,
              lot.expiresAt ? new Date(lot.expiresAt) : null,
            );
            firstId = firstId ?? movement.id;
            remaining = Math.round((remaining - take) * 1e6) / 1e6;
          }
          return { movementId: firstId!, duplicate: false };
        }

        const inboundExpiry =
          lotTracked && INBOUND.has(input.movementType)
            ? (input.expiresAt ??
              (sku.shelfLifeDays ? new Date(Date.now() + sku.shelfLifeDays * 86_400_000) : null))
            : (input.expiresAt ?? null);
        const movement = await writeMovement(
          input.quantity,
          input.idempotencyKey,
          input.lotNumber ?? null,
          inboundExpiry,
        );
        return { movementId: movement.id, duplicate: false };
      });
    } catch (error) {
      // A concurrent receipt of the same serial lost the unique race on
      // serial_position: report it as a business conflict, not a 500.
      if ((error as { code?: string }).code === 'P2002' && serials) {
        throw new DomainError('CONFLICT', 'A serial number was received concurrently — retry');
      }
      throw error;
    }
  }

  /**
   * WMS-018: inside the movement's transaction — inbound units must not be
   * in stock anywhere; outbound units must be in stock in this warehouse.
   * Position rows are row-locked (FOR UPDATE) in sorted order.
   */
  private async applySerials(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: MovementInput,
    movementId: string,
    serials: string[],
  ) {
    const inbound = INBOUND.has(input.movementType);
    for (const serial of serials) {
      const rows = await tx.$queryRaw<
        Array<{ id: string; in_stock: boolean; warehouse_id: string | null }>
      >`SELECT id, in_stock, warehouse_id FROM serial_position
        WHERE tenant_id = ${tenantId}::uuid AND sku_id = ${input.skuId}::uuid AND serial = ${serial}
        FOR UPDATE`;
      const position = rows[0];
      if (inbound) {
        if (position?.in_stock) {
          throw new DomainError('CONFLICT', `Serial ${serial} is already in stock`);
        }
        if (position) {
          await tx.serialPosition.updateMany({
            where: { id: position.id, tenantId },
            data: { inStock: true, warehouseId: input.warehouseId, lastMovementId: movementId },
          });
        } else {
          await tx.serialPosition.create({
            data: {
              tenantId,
              skuId: input.skuId,
              serial,
              inStock: true,
              warehouseId: input.warehouseId,
              lastMovementId: movementId,
            },
          });
        }
      } else {
        if (!position?.in_stock || position.warehouse_id !== input.warehouseId) {
          throw new DomainError(
            'INVALID_STATE',
            `Serial ${serial} is not in stock in this warehouse`,
          );
        }
        await tx.serialPosition.updateMany({
          where: { id: position.id, tenantId },
          data: { inStock: false, warehouseId: null, lastMovementId: movementId },
        });
      }
    }
    await tx.serialMovement.createMany({
      data: serials.map((serial) => ({ tenantId, movementId, skuId: input.skuId, serial })),
    });
  }

  /**
   * WMS-018: serial numbers for stock that already exists without them
   * (e.g. a SKU switched to serial tracking). No movement is posted — the
   * count may not exceed the warehouse's on-hand that has no serial yet.
   */
  async onboardSerials(
    input: { warehouseId: string; skuId: string; serials: string[] },
    ctx: RequestContext,
  ): Promise<{ onboarded: number; untrackedLeft: number }> {
    const sku = await this.skuGate.getSkuState(ctx.tenantId, input.skuId);
    if (!sku.exists) throw notFound('Sku', input.skuId);
    if (!sku.serialPolicy || sku.serialPolicy === 'NONE') {
      throw new DomainError('INVALID_STATE', 'This SKU is not serial-tracked');
    }
    const serials = validateSerials(sku.serialPolicy, input.serials.length, input.serials) ?? [];
    if (!serials.length) throw new DomainError('VALIDATION_FAILED', 'Provide serial numbers');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const warehouse = await tx.warehouse.findFirst({
          where: { id: input.warehouseId, tenantId: ctx.tenantId },
        });
        if (!warehouse) throw notFound('Warehouse', input.warehouseId);
        await this.lockStock(tx, ctx.tenantId, input.warehouseId, input.skuId);
        const { onHand } = await this.sums(tx, ctx.tenantId, input.warehouseId, input.skuId);
        const tracked = await tx.serialPosition.count({
          where: {
            tenantId: ctx.tenantId,
            skuId: input.skuId,
            warehouseId: input.warehouseId,
            inStock: true,
          },
        });
        const untracked = Math.floor(onHand) - tracked;
        if (serials.length > untracked) {
          throw new DomainError(
            'INVALID_STATE',
            `Only ${Math.max(untracked, 0)} unit(s) in this warehouse have no serial number yet`,
          );
        }
        for (const serial of serials) {
          const rows = await tx.$queryRaw<Array<{ id: string; in_stock: boolean }>>`
            SELECT id, in_stock FROM serial_position
            WHERE tenant_id = ${ctx.tenantId}::uuid AND sku_id = ${input.skuId}::uuid AND serial = ${serial}
            FOR UPDATE`;
          if (rows[0]?.in_stock) {
            throw new DomainError('CONFLICT', `Serial ${serial} is already in stock`);
          }
          if (rows[0]) {
            await tx.serialPosition.updateMany({
              where: { id: rows[0].id, tenantId: ctx.tenantId },
              data: { inStock: true, warehouseId: input.warehouseId, lastMovementId: null },
            });
          } else {
            await tx.serialPosition.create({
              data: {
                tenantId: ctx.tenantId,
                skuId: input.skuId,
                serial,
                inStock: true,
                warehouseId: input.warehouseId,
              },
            });
          }
        }
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'stock.serial.onboard',
          objectType: 'Sku',
          objectId: input.skuId,
          source: 'api',
          newValues: { warehouseId: input.warehouseId, count: serials.length },
        });
        return { onboarded: serials.length, untrackedLeft: untracked - serials.length };
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', 'A serial number was onboarded concurrently — retry');
      }
      throw error;
    }
  }

  /** WMS-018: where a serialised unit is and every movement it took part in. */
  async serialTrace(skuId: string, serial: string, ctx: RequestContext) {
    const position = await this.prisma.serialPosition.findFirst({
      where: { tenantId: ctx.tenantId, skuId, serial },
    });
    if (!position) throw notFound('SerialPosition', serial);
    const links = await this.prisma.serialMovement.findMany({
      where: { tenantId: ctx.tenantId, skuId, serial },
      orderBy: { createdAt: 'asc' },
    });
    const movements = await this.prisma.stockMovement.findMany({
      where: { tenantId: ctx.tenantId, id: { in: links.map((l) => l.movementId) } },
      orderBy: { occurredAt: 'asc' },
    });
    return {
      skuId,
      serial,
      inStock: position.inStock,
      warehouseId: position.warehouseId,
      movements: movements.map((m) => ({
        movementId: m.id,
        movementType: m.movementType,
        warehouseId: m.warehouseId,
        reason: m.reason,
        occurredAt: m.occurredAt.toISOString(),
      })),
    };
  }

  /** WMS-018: serialised units currently in stock (optionally per warehouse). */
  async serialsInStock(
    params: { skuId: string; warehouseId?: string | undefined },
    ctx: RequestContext,
  ) {
    const rows = await this.prisma.serialPosition.findMany({
      where: {
        tenantId: ctx.tenantId,
        skuId: params.skuId,
        inStock: true,
        ...(params.warehouseId ? { warehouseId: params.warehouseId } : {}),
      },
      orderBy: { serial: 'asc' },
      take: 5000,
    });
    return rows.map((r) => ({ serial: r.serial, warehouseId: r.warehouseId }));
  }

  /** Per-lot on-hand from the ledger (WMS-017), with expiry flags. */
  async lotBalances(
    warehouseId: string,
    skuId: string,
    ctx: RequestContext,
  ): Promise<LotBalance[]> {
    return this.lotBalancesInTx(this.prisma, ctx.tenantId, warehouseId, skuId);
  }

  private async lotBalancesInTx(
    db: {
      stockMovement: {
        findMany: (args: { where: Record<string, unknown> }) => Promise<
          Array<{
            movementType: StockMovementType;
            quantity: { toString(): string };
            lotNumber: string | null;
            expiresAt: Date | null;
          }>
        >;
      };
    },
    tenantId: string,
    warehouseId: string,
    skuId: string,
  ): Promise<LotBalance[]> {
    const movements = await db.stockMovement.findMany({
      where: { tenantId, warehouseId, skuId, lotNumber: { not: null } },
    });
    const lots = new Map<string, { onHand: number; expiresAt: Date | null }>();
    for (const m of movements) {
      const lot = lots.get(m.lotNumber!) ?? { onHand: 0, expiresAt: null };
      const qty = Number(m.quantity);
      lot.onHand += OUTBOUND.has(m.movementType) ? -qty : qty;
      if (m.expiresAt) lot.expiresAt = m.expiresAt;
      lots.set(m.lotNumber!, lot);
    }
    const now = Date.now();
    const soon = now + 30 * 86_400_000;
    return [...lots.entries()]
      .map(([lotNumber, lot]) => ({
        lotNumber,
        onHand: (Math.round(lot.onHand * 1e6) / 1e6).toString(),
        expiresAt: lot.expiresAt ? lot.expiresAt.toISOString() : null,
        expired: lot.expiresAt !== null && lot.expiresAt.getTime() < now,
        expiringSoon:
          lot.expiresAt !== null &&
          lot.expiresAt.getTime() >= now &&
          lot.expiresAt.getTime() < soon,
      }))
      .sort((a, z) => {
        if (a.expiresAt === null) return 1;
        if (z.expiresAt === null) return -1;
        return a.expiresAt.localeCompare(z.expiresAt);
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
      const held = this.holds
        ? await this.holds.activeHeld(ctx.tenantId, input.warehouseId, input.skuId)
        : 0;
      const available = onHand - reserved - held;
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

  /** Tenant-wide availability for one SKU across all warehouses (WMS read). */
  /**
   * Channel availability (COM-010): sellable quantities for a set of
   * ACTIVE SKUs in one call — built for storefronts and marketplace
   * feeds. Derived from the ledger and open reservations; never from
   * an editable stock field.
   */
  async listLocations(
    warehouseId: string,
    ctx: RequestContext,
  ): Promise<Array<{ id: string; code: string }>> {
    const rows = await this.prisma.warehouseLocation.findMany({
      where: { tenantId: ctx.tenantId, warehouseId },
      orderBy: [{ code: 'asc' }],
      take: 500,
    });
    return rows.map((r) => ({ id: r.id, code: r.code }));
  }

  /**
   * Putaway (WMS-007): move received (unassigned) stock into a bin as
   * an idempotent TRANSFER_OUT/TRANSFER_IN pair keyed by putawayKey —
   * the ledger stays the only truth, bins are just movement locations.
   */
  async putaway(
    input: {
      warehouseId: string;
      skuId: string;
      quantity: number;
      toLocationId: string;
      putawayKey: string;
    },
    ctx: RequestContext,
  ): Promise<{ duplicate: boolean }> {
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(input.putawayKey)) {
      throw new DomainError('VALIDATION_FAILED', 'putawayKey must be 6-64 safe characters');
    }
    const location = await this.prisma.warehouseLocation.findFirst({
      where: { id: input.toLocationId, tenantId: ctx.tenantId, warehouseId: input.warehouseId },
    });
    if (!location) throw notFound('WarehouseLocation', input.toLocationId);
    const out = await this.postMovement(
      {
        warehouseId: input.warehouseId,
        skuId: input.skuId,
        movementType: 'TRANSFER_OUT',
        quantity: input.quantity,
        idempotencyKey: `putaway:${input.putawayKey}:out`,
        reason: `Putaway to ${location.code}`,
      },
      ctx,
    );
    await this.postMovement(
      {
        warehouseId: input.warehouseId,
        skuId: input.skuId,
        movementType: 'TRANSFER_IN',
        quantity: input.quantity,
        idempotencyKey: `putaway:${input.putawayKey}:in`,
        locationId: location.id,
        reason: `Putaway to ${location.code}`,
      },
      ctx,
    );
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'wms.putaway',
      objectType: 'WarehouseLocation',
      objectId: location.id,
      source: 'api',
      newValues: { skuId: input.skuId, quantity: input.quantity, putawayKey: input.putawayKey },
    });
    return { duplicate: out.duplicate };
  }

  /**
   * Per-bin stock view (WMS-007): location-tagged movements summed per
   * bin and SKU. Stock never written anywhere — derived live.
   */
  async stockByLocation(
    warehouseId: string,
    ctx: RequestContext,
  ): Promise<Array<{ locationId: string; locationCode: string; skuId: string; onHand: string }>> {
    const locations = await this.prisma.warehouseLocation.findMany({
      where: { tenantId: ctx.tenantId, warehouseId },
      take: 500,
    });
    const codeOf = new Map(locations.map((l) => [l.id, l.code]));
    const movements = await this.prisma.stockMovement.findMany({
      where: { tenantId: ctx.tenantId, warehouseId, locationId: { not: null } },
      select: { locationId: true, skuId: true, movementType: true, quantity: true },
      take: 10_000,
    });
    const sums = new Map<string, number>();
    for (const m of movements) {
      const key = `${m.locationId}|${m.skuId}`;
      const sign = INBOUND.has(m.movementType) ? 1 : -1;
      sums.set(key, (sums.get(key) ?? 0) + sign * Number(m.quantity));
    }
    const rows: Array<{ locationId: string; locationCode: string; skuId: string; onHand: string }> =
      [];
    for (const [key, value] of sums) {
      if (Math.abs(value) < 1e-9) continue;
      const [locationId, skuId] = key.split('|');
      rows.push({
        locationId: locationId ?? '',
        locationCode: codeOf.get(locationId ?? '') ?? '?',
        skuId: skuId ?? '',
        onHand: String(value),
      });
    }
    return rows.sort((a, b) => a.locationCode.localeCompare(b.locationCode));
  }

  async channelAvailability(
    skuIds: string[] | undefined,
    ctx: RequestContext,
  ): Promise<
    Array<{ skuId: string; code: string; name: string; onHand: number; available: number }>
  > {
    const skus = await this.prisma.sku.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'ACTIVE',
        ...(skuIds && skuIds.length > 0 ? { id: { in: skuIds.slice(0, 200) } } : {}),
      },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
      take: 200,
    });
    if (skus.length === 0) return [];
    const ids = skus.map((s) => s.id);
    const movements = await this.prisma.stockMovement.groupBy({
      by: ['skuId', 'movementType'],
      where: { tenantId: ctx.tenantId, skuId: { in: ids } },
      _sum: { quantity: true },
    });
    const onHand = new Map<string, number>();
    for (const m of movements) {
      const inbound = ['RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN'].includes(m.movementType);
      onHand.set(
        m.skuId,
        (onHand.get(m.skuId) ?? 0) + Number(m._sum.quantity ?? 0) * (inbound ? 1 : -1),
      );
    }
    const reservations = await this.prisma.stockReservation.groupBy({
      by: ['skuId'],
      where: { tenantId: ctx.tenantId, skuId: { in: ids }, status: 'ACTIVE' },
      _sum: { quantity: true },
    });
    const reserved = new Map(reservations.map((r) => [r.skuId, Number(r._sum.quantity ?? 0)]));
    const held = this.holds
      ? await this.holds.activeHeldBySku(ctx.tenantId, ids)
      : new Map<string, number>();
    return skus.map((sku) => {
      const oh = onHand.get(sku.id) ?? 0;
      return {
        skuId: sku.id,
        code: sku.code,
        name: sku.name,
        onHand: oh,
        available: Math.max(0, oh - (reserved.get(sku.id) ?? 0) - (held.get(sku.id) ?? 0)),
      };
    });
  }

  async totalAvailability(
    skuId: string,
    ctx: RequestContext,
  ): Promise<{ onHand: number; available: number }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ on_hand: string | null; reserved: string | null }>
    >`
      SELECT
        (SELECT COALESCE(SUM(CASE WHEN movement_type IN ('RECEIPT','ADJUSTMENT_IN','TRANSFER_IN')
                                  THEN quantity ELSE -quantity END), 0)
           FROM "stock_movement"
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND sku_id = ${skuId}::uuid) AS on_hand,
        (SELECT COALESCE(SUM(quantity), 0)
           FROM "stock_reservation"
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND sku_id = ${skuId}::uuid
            AND status = 'ACTIVE') AS reserved`;
    const row = rows[0];
    const onHand = Number(row?.on_hand ?? 0);
    const reserved = Number(row?.reserved ?? 0);
    return { onHand, available: onHand - reserved };
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

import { writeAudit } from '@nexora/audit';
import type { PrismaClient, QuarantineStatus } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Quarantine holds (QMS-006/WMS-006). A hold blocks a quantity of a
 * SKU in a warehouse from being reserved until quality decides:
 * RELEASE returns it to availability, SCRAP posts a compensating
 * ADJUSTMENT_OUT ledger movement (idempotent per hold) and removes it
 * for good. The stock ledger stays the only truth — a hold never edits
 * stock, it only subtracts from what may be promised.
 */

export interface QuarantineView {
  id: string;
  warehouseId: string;
  skuId: string;
  skuCode: string;
  quantity: string;
  reason: string;
  status: QuarantineStatus;
  createdAt: string;
}

/** Cross-domain-free stock gate owned by this same WMS package. */
export interface LedgerGate {
  postMovement(
    input: {
      warehouseId: string;
      skuId: string;
      movementType: 'ADJUSTMENT_OUT';
      quantity: number;
      idempotencyKey: string;
      reason?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ movementId: string; duplicate: boolean }>;
  totalOnHand(tenantId: string, warehouseId: string, skuId: string): Promise<number>;
}

export class QuarantineService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ledger: LedgerGate,
  ) {}

  private async toView(h: {
    id: string;
    warehouseId: string;
    skuId: string;
    quantity: { toString(): string };
    reason: string;
    status: QuarantineStatus;
    createdAt: Date;
  }): Promise<QuarantineView> {
    const sku = await this.prisma.sku.findFirst({
      where: { id: h.skuId },
      select: { code: true },
    });
    return {
      id: h.id,
      warehouseId: h.warehouseId,
      skuId: h.skuId,
      skuCode: sku?.code ?? '?',
      quantity: h.quantity.toString(),
      reason: h.reason,
      status: h.status,
      createdAt: h.createdAt.toISOString(),
    };
  }

  async listHolds(ctx: RequestContext): Promise<QuarantineView[]> {
    const rows = await this.prisma.quarantineHold.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return Promise.all(rows.map((r) => this.toView(r)));
  }

  async placeHold(
    input: { warehouseId: string; skuId: string; quantity: number; reason: string },
    ctx: RequestContext,
  ): Promise<QuarantineView> {
    if (!(input.quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    if (!input.reason?.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'A reason is required');
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.warehouseId, tenantId: ctx.tenantId },
    });
    if (!warehouse) throw notFound('Warehouse', input.warehouseId);
    const sku = await this.prisma.sku.findFirst({
      where: { id: input.skuId, tenantId: ctx.tenantId },
    });
    if (!sku) throw notFound('Sku', input.skuId);
    const onHand = await this.ledger.totalOnHand(ctx.tenantId, input.warehouseId, input.skuId);
    const held = await this.activeHeld(ctx.tenantId, input.warehouseId, input.skuId);
    if (input.quantity > onHand - held) {
      throw new DomainError('INVALID_STATE', 'Cannot quarantine more than un-held on-hand stock');
    }
    const created = await this.prisma.quarantineHold.create({
      data: {
        tenantId: ctx.tenantId,
        warehouseId: input.warehouseId,
        skuId: input.skuId,
        quantity: input.quantity,
        reason: input.reason.trim(),
        createdBy: ctx.userId ?? null,
      },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'wms.quarantine.place',
      objectType: 'QuarantineHold',
      objectId: created.id,
      source: 'api',
      newValues: { skuId: input.skuId, quantity: input.quantity, reason: input.reason.trim() },
    });
    return this.toView(created);
  }

  async decide(
    holdId: string,
    decision: 'RELEASE' | 'SCRAP',
    ctx: RequestContext,
  ): Promise<QuarantineView> {
    const hold = await this.prisma.quarantineHold.findFirst({
      where: { id: holdId, tenantId: ctx.tenantId },
    });
    if (!hold) throw notFound('QuarantineHold', holdId);
    if (hold.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', 'This hold is already decided');
    }
    if (decision === 'SCRAP') {
      await this.ledger.postMovement(
        {
          warehouseId: hold.warehouseId,
          skuId: hold.skuId,
          movementType: 'ADJUSTMENT_OUT',
          quantity: Number(hold.quantity),
          idempotencyKey: `quarantine:${hold.id}:scrap`,
          reason: `Quarantine scrap: ${hold.reason}`,
        },
        ctx,
      );
    }
    const flipped = await this.prisma.quarantineHold.updateMany({
      where: { id: hold.id, tenantId: ctx.tenantId, status: 'ACTIVE' },
      data: {
        status: decision === 'RELEASE' ? 'RELEASED' : 'SCRAPPED',
        decidedBy: ctx.userId ?? null,
      },
    });
    if (flipped.count === 0) {
      throw new DomainError('CONFLICT', 'Hold changed concurrently');
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'wms.quarantine.decide',
      objectType: 'QuarantineHold',
      objectId: hold.id,
      source: 'api',
      newValues: { decision },
    });
    const fresh = await this.prisma.quarantineHold.findFirst({ where: { id: hold.id } });
    return this.toView(fresh as NonNullable<typeof fresh>);
  }

  /** Total ACTIVE held quantity for one warehouse+SKU. */
  async activeHeld(tenantId: string, warehouseId: string, skuId: string): Promise<number> {
    const agg = await this.prisma.quarantineHold.aggregate({
      where: { tenantId, warehouseId, skuId, status: 'ACTIVE' },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ? Number(agg._sum.quantity) : 0;
  }

  /** Total ACTIVE held per SKU across warehouses (for tenant-wide views). */
  async activeHeldBySku(tenantId: string, skuIds: string[]): Promise<Map<string, number>> {
    if (skuIds.length === 0) return new Map();
    const rows = await this.prisma.quarantineHold.groupBy({
      by: ['skuId'],
      where: { tenantId, skuId: { in: skuIds }, status: 'ACTIVE' },
      _sum: { quantity: true },
    });
    return new Map(rows.map((r) => [r.skuId, Number(r._sum.quantity ?? 0)]));
  }
}

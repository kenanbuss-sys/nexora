import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Inventory valuation & product costing (FIN-004/005). A SKU carries a
 * standard unit cost; valuation derives live from the stock ledger —
 * on-hand quantity times standard cost, never from an editable stock
 * figure. SKUs without a cost are reported honestly as unvalued.
 */

export interface ValuationRow {
  skuId: string;
  code: string;
  name: string;
  onHand: number;
  standardCost: string | null;
  value: string | null;
}

export class ValuationService {
  constructor(private readonly prisma: PrismaClient) {}

  async setStandardCost(skuId: string, cost: number, ctx: RequestContext): Promise<void> {
    if (!Number.isFinite(cost) || cost < 0) {
      throw new DomainError('VALIDATION_FAILED', 'Standard cost must be zero or positive');
    }
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, tenantId: ctx.tenantId } });
    if (!sku) throw notFound('Sku', skuId);
    await this.prisma.sku.update({ where: { id: sku.id }, data: { standardCost: cost } });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'fin.sku.standard_cost',
      objectType: 'Sku',
      objectId: sku.id,
      source: 'api',
      previousValues: { standardCost: sku.standardCost ? sku.standardCost.toString() : null },
      newValues: { standardCost: cost },
    });
  }

  /** Live valuation: ledger on-hand × standard cost, per active SKU. */
  async valuation(ctx: RequestContext): Promise<{
    rows: ValuationRow[];
    totalValue: string;
    unvaluedSkus: number;
  }> {
    const skus = await this.prisma.sku.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ['ACTIVE', 'DISCONTINUED'] } },
      select: { id: true, code: true, name: true, standardCost: true },
      orderBy: { code: 'asc' },
      take: 500,
    });
    if (skus.length === 0) return { rows: [], totalValue: '0.00', unvaluedSkus: 0 };
    const movements = await this.prisma.stockMovement.groupBy({
      by: ['skuId', 'movementType'],
      where: { tenantId: ctx.tenantId, skuId: { in: skus.map((s) => s.id) } },
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
    let total = 0;
    let unvalued = 0;
    const rows: ValuationRow[] = [];
    for (const sku of skus) {
      const qty = onHand.get(sku.id) ?? 0;
      if (qty === 0 && sku.standardCost === null) continue;
      let value: string | null = null;
      if (sku.standardCost !== null) {
        const v = Math.round(qty * Number(sku.standardCost) * 100) / 100;
        value = v.toFixed(2);
        total += v;
      } else if (qty > 0) {
        unvalued += 1;
      }
      rows.push({
        skuId: sku.id,
        code: sku.code,
        name: sku.name,
        onHand: qty,
        standardCost: sku.standardCost ? sku.standardCost.toString() : null,
        value,
      });
    }
    return { rows, totalValue: total.toFixed(2), unvaluedSkus: unvalued };
  }
}

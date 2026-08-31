import { writeAudit } from '@nexora/audit';
import type { PlannedOrderType, PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Planning/MRP — per-SKU policies (PLAN-004/005) and synchronous MRP
 * runs (PLAN-006/007/008/009).
 *
 * The run is a READ-MODEL computation (03_EVENT_ARCHITECTURE: separate
 * read models for heavy aggregates): it aggregates demand and supply
 * across domains read-only, then persists an append-only snapshot
 * (MrpRun + suggestions) in the planning domain. It never mutates other
 * domains — converting a suggestion into a real requisition or order
 * remains a human action through those domains' own interfaces.
 *
 * Net requirement per SKU:
 *   demand (open CONFIRMED/ON_HOLD sales-order lines)
 *   + safety stock (policy)
 *   − on-hand (stock ledger)
 *   − on-order (open PO lines not yet received)
 * A positive net yields a PRODUCTION suggestion when a released BOM
 * exists (components are exploded one level into PURCHASE suggestions),
 * otherwise a PURCHASE suggestion. Lead time (policy) becomes the due
 * window (PLAN-009).
 */

export interface PolicyView {
  id: string;
  skuId: string;
  safetyStock: string;
  reorderPoint: string;
  leadTimeDays: number;
}

export interface SuggestionView {
  id: string;
  skuId: string;
  suggestionType: PlannedOrderType;
  quantity: string;
  reason: string;
  dueInDays: number;
}

export interface MrpRunView {
  id: string;
  runNumber: string;
  demandSkus: number;
  suggestionCount: number;
  createdAt: string;
  suggestions: SuggestionView[];
}

export class PlanningService {
  constructor(private readonly prisma: PrismaClient) {}

  // --------------------------------------------------------------- policies

  async listPolicies(ctx: RequestContext): Promise<PolicyView[]> {
    const rows = await this.prisma.planningPolicy.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((p) => ({
      id: p.id,
      skuId: p.skuId,
      safetyStock: p.safetyStock.toString(),
      reorderPoint: p.reorderPoint.toString(),
      leadTimeDays: p.leadTimeDays,
    }));
  }

  /** Creates or updates the policy for a SKU (idempotent upsert). */
  async setPolicy(
    input: {
      skuId: string;
      safetyStock?: number | undefined;
      reorderPoint?: number | undefined;
      leadTimeDays?: number | undefined;
    },
    ctx: RequestContext,
  ): Promise<PolicyView> {
    if ((input.safetyStock ?? 0) < 0 || (input.reorderPoint ?? 0) < 0) {
      throw new DomainError('VALIDATION_FAILED', 'Stock levels cannot be negative');
    }
    if ((input.leadTimeDays ?? 0) < 0) {
      throw new DomainError('VALIDATION_FAILED', 'Lead time cannot be negative');
    }
    const sku = await this.prisma.sku.findFirst({
      where: { id: input.skuId, tenantId: ctx.tenantId },
    });
    if (!sku) throw notFound('Sku', input.skuId);

    const policy = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.planningPolicy.upsert({
        where: { tenantId_skuId: { tenantId: ctx.tenantId, skuId: input.skuId } },
        create: {
          tenantId: ctx.tenantId,
          skuId: input.skuId,
          safetyStock: input.safetyStock ?? 0,
          reorderPoint: input.reorderPoint ?? 0,
          leadTimeDays: input.leadTimeDays ?? 0,
        },
        update: {
          ...(input.safetyStock !== undefined ? { safetyStock: input.safetyStock } : {}),
          ...(input.reorderPoint !== undefined ? { reorderPoint: input.reorderPoint } : {}),
          ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'plan.policy.set',
        objectType: 'PlanningPolicy',
        objectId: upserted.id,
        source: 'api',
        newValues: {
          skuId: input.skuId,
          safetyStock: input.safetyStock,
          reorderPoint: input.reorderPoint,
          leadTimeDays: input.leadTimeDays,
        },
      });
      return upserted;
    });
    return {
      id: policy.id,
      skuId: policy.skuId,
      safetyStock: policy.safetyStock.toString(),
      reorderPoint: policy.reorderPoint.toString(),
      leadTimeDays: policy.leadTimeDays,
    };
  }

  // ------------------------------------------------------------------- runs

  async listRuns(ctx: RequestContext): Promise<MrpRunView[]> {
    const runs = await this.prisma.mrpRun.findMany({
      where: { tenantId: ctx.tenantId },
      include: { suggestions: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 20,
    });
    return runs.map((r) => this.toRunView(r));
  }

  async getRun(runId: string, ctx: RequestContext): Promise<MrpRunView> {
    const run = await this.prisma.mrpRun.findFirst({
      where: { id: runId, tenantId: ctx.tenantId },
      include: { suggestions: true },
    });
    if (!run) throw notFound('MrpRun', runId);
    return this.toRunView(run);
  }

  /** Executes MRP synchronously and stores the snapshot (PLAN-006..009). */
  async runMrp(ctx: RequestContext): Promise<MrpRunView> {
    // 1) Demand: open sales-order lines (orders not yet fulfilled/cancelled).
    const openOrders = await this.prisma.salesOrder.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ['CONFIRMED', 'ON_HOLD'] } },
      include: { lines: true },
    });
    const demand = new Map<string, number>();
    for (const order of openOrders) {
      for (const line of order.lines) {
        demand.set(line.skuId, (demand.get(line.skuId) ?? 0) + Number(line.quantity));
      }
    }

    // 2) Policies pull their SKUs into planning even without demand.
    const policies = await this.prisma.planningPolicy.findMany({
      where: { tenantId: ctx.tenantId },
    });
    const policyBySku = new Map(policies.map((p) => [p.skuId, p]));
    for (const p of policies) {
      if (!demand.has(p.skuId)) demand.set(p.skuId, 0);
    }

    // 3) Supply: on-hand from the stock ledger, on-order from open POs.
    const skuIds = [...demand.keys()];
    const onHandBySku = new Map<string, number>();
    if (skuIds.length > 0) {
      const movements = await this.prisma.stockMovement.groupBy({
        by: ['skuId', 'movementType'],
        where: { tenantId: ctx.tenantId, skuId: { in: skuIds } },
        _sum: { quantity: true },
      });
      for (const m of movements) {
        const inbound = ['RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN'].includes(m.movementType);
        const sign = inbound ? 1 : -1;
        onHandBySku.set(
          m.skuId,
          (onHandBySku.get(m.skuId) ?? 0) + sign * Number(m._sum.quantity ?? 0),
        );
      }
    }
    const onOrderBySku = new Map<string, number>();
    if (skuIds.length > 0) {
      const openPoLines = await this.prisma.purchaseOrderLine.findMany({
        where: { tenantId: ctx.tenantId, skuId: { in: skuIds } },
        include: { po: true },
      });
      for (const line of openPoLines) {
        if (line.po.status === 'OPEN' || line.po.status === 'PARTIALLY_RECEIVED') {
          const remaining = Number(line.quantity) - Number(line.receivedQty);
          if (remaining > 0) {
            onOrderBySku.set(line.skuId, (onOrderBySku.get(line.skuId) ?? 0) + remaining);
          }
        }
      }
    }

    // 4) Net requirements and suggestions.
    const suggestions: Array<{
      skuId: string;
      suggestionType: PlannedOrderType;
      quantity: number;
      reason: string;
      dueInDays: number;
    }> = [];
    for (const [skuId, demandQty] of demand) {
      const policy = policyBySku.get(skuId);
      const safety = policy ? Number(policy.safetyStock) : 0;
      const onHand = onHandBySku.get(skuId) ?? 0;
      const onOrder = onOrderBySku.get(skuId) ?? 0;
      const net = demandQty + safety - onHand - onOrder;
      if (net <= 0) continue;
      const quantity = Math.round(net * 1e6) / 1e6;
      const lead = policy?.leadTimeDays ?? 0;
      const reasonBase = `demand ${demandQty} + safety ${safety} − on-hand ${onHand} − on-order ${onOrder}`;

      const releasedBom = await this.prisma.bom.findFirst({
        where: { tenantId: ctx.tenantId, skuId, status: 'RELEASED' },
        include: { lines: true },
      });
      if (releasedBom) {
        suggestions.push({
          skuId,
          suggestionType: 'PRODUCTION',
          quantity,
          reason: `Make ${quantity}: ${reasonBase}`,
          dueInDays: lead,
        });
        // One-level component explosion feeds purchasing (PLAN-006).
        for (const line of releasedBom.lines) {
          const gross = quantity * Number(line.quantity) * (1 + Number(line.scrapPct) / 100);
          const componentQty = Math.round(gross * 1e6) / 1e6;
          const componentOnHand = onHandBySku.get(line.componentSkuId) ?? 0;
          const componentNet = componentQty - componentOnHand;
          if (componentNet > 0) {
            suggestions.push({
              skuId: line.componentSkuId,
              suggestionType: 'PURCHASE',
              quantity: Math.round(componentNet * 1e6) / 1e6,
              reason: `Component for planned production of ${quantity}`,
              dueInDays: lead,
            });
          }
        }
      } else {
        suggestions.push({
          skuId,
          suggestionType: 'PURCHASE',
          quantity,
          reason: `Buy ${quantity}: ${reasonBase}`,
          dueInDays: lead,
        });
      }
    }

    // 5) Persist the snapshot atomically.
    const run = await this.prisma.$transaction(async (tx) => {
      const count = await tx.mrpRun.count({ where: { tenantId: ctx.tenantId } });
      const created = await tx.mrpRun.create({
        data: {
          tenantId: ctx.tenantId,
          runNumber: `MRP-${String(count + 1).padStart(5, '0')}`,
          demandSkus: demand.size,
          suggestionCount: suggestions.length,
          createdBy: ctx.userId ?? null,
          suggestions: {
            create: suggestions.map((s) => ({
              tenantId: ctx.tenantId,
              skuId: s.skuId,
              suggestionType: s.suggestionType,
              quantity: s.quantity,
              reason: s.reason,
              dueInDays: s.dueInDays,
            })),
          },
        },
        include: { suggestions: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'plan.mrp.run',
        objectType: 'MrpRun',
        objectId: created.id,
        source: 'api',
        newValues: { runNumber: created.runNumber, suggestions: suggestions.length },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.MRP_RUN_COMPLETED,
        aggregateType: 'MrpRun',
        aggregateId: created.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { runId: created.id, runNumber: created.runNumber },
      });
      for (const s of created.suggestions) {
        await publishToOutbox(tx, {
          tenantId: ctx.tenantId,
          eventType: EVENT_TYPES.PLANNED_ORDER_CREATED,
          aggregateType: 'MrpSuggestion',
          aggregateId: s.id,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          payload: { runId: created.id, skuId: s.skuId, type: s.suggestionType },
        });
      }
      return created;
    });
    return this.toRunView(run);
  }

  private toRunView(run: {
    id: string;
    runNumber: string;
    demandSkus: number;
    suggestionCount: number;
    createdAt: Date;
    suggestions: Array<{
      id: string;
      skuId: string;
      suggestionType: PlannedOrderType;
      quantity: { toString(): string };
      reason: string;
      dueInDays: number;
    }>;
  }): MrpRunView {
    return {
      id: run.id,
      runNumber: run.runNumber,
      demandSkus: run.demandSkus,
      suggestionCount: run.suggestionCount,
      createdAt: run.createdAt.toISOString(),
      suggestions: run.suggestions.map((s) => ({
        id: s.id,
        skuId: s.skuId,
        suggestionType: s.suggestionType,
        quantity: s.quantity.toString(),
        reason: s.reason,
        dueInDays: s.dueInDays,
      })),
    };
  }
}

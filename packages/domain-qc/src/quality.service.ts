import { writeAudit } from '@nexora/audit';
import type { NcrSeverity, NcrStatus, PrismaClient, QcInspectionStatus } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Quality — QC plans per SKU (VER-013), inspections against work orders
 * with recorded item results, supervisor finalization (VER-014, SoD:
 * the recorder cannot finalize their own inspection), automatic NCRs on
 * failure, and a production-blocking gate MES consults before
 * completing a work order.
 */

export interface QcPlanItemView {
  id: string;
  seq: number;
  name: string;
  requirement: string;
}

export interface QcPlanView {
  id: string;
  skuId: string;
  name: string;
  active: boolean;
  items: QcPlanItemView[];
}

export interface QcInspectionItemView {
  id: string;
  seq: number;
  name: string;
  requirement: string;
  passed: boolean | null;
  note: string | null;
}

export interface QcInspectionView {
  id: string;
  inspectionNumber: string;
  workOrderId: string;
  skuId: string;
  status: QcInspectionStatus;
  notes: string | null;
  items: QcInspectionItemView[];
}

export interface NcrView {
  id: string;
  ncrNumber: string;
  workOrderId: string | null;
  skuId: string;
  description: string;
  severity: NcrSeverity;
  status: NcrStatus;
  resolution: string | null;
}

/** What MES asks before completing a work order (operation blocking). */
export type QcState = 'NOT_REQUIRED' | 'PENDING' | 'PASSED' | 'FAILED';

export class QualityService {
  constructor(private readonly prisma: PrismaClient) {}

  // ------------------------------------------------------------------ plans

  async listPlans(ctx: RequestContext): Promise<QcPlanView[]> {
    const plans = await this.prisma.qcPlan.findMany({
      where: { tenantId: ctx.tenantId },
      include: { items: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return plans.map((p) => this.planView(p));
  }

  /** One plan per SKU: items are the required checks. */
  async createPlan(
    input: { skuId: string; name: string; items: Array<{ name: string; requirement: string }> },
    ctx: RequestContext,
  ): Promise<QcPlanView> {
    if (input.items.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'A QC plan needs at least one check');
    }
    const sku = await this.prisma.sku.findFirst({
      where: { id: input.skuId, tenantId: ctx.tenantId },
    });
    if (!sku) throw notFound('Sku', input.skuId);
    const existing = await this.prisma.qcPlan.findFirst({
      where: { tenantId: ctx.tenantId, skuId: input.skuId },
    });
    if (existing) throw new DomainError('CONFLICT', 'The SKU already has a QC plan');

    const plan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.qcPlan.create({
        data: {
          tenantId: ctx.tenantId,
          skuId: input.skuId,
          name: input.name,
          createdBy: ctx.userId ?? null,
          items: {
            create: input.items.map((item, index) => ({
              tenantId: ctx.tenantId,
              seq: (index + 1) * 10,
              name: item.name,
              requirement: item.requirement,
            })),
          },
        },
        include: { items: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'qc.plan.create',
        objectType: 'QcPlan',
        objectId: created.id,
        source: 'api',
        newValues: { skuId: input.skuId, items: input.items.length },
      });
      return created;
    });
    return this.planView(plan);
  }

  // ------------------------------------------------------------ inspections

  async listInspections(
    filter: { workOrderId?: string | undefined },
    ctx: RequestContext,
  ): Promise<QcInspectionView[]> {
    const inspections = await this.prisma.qcInspection.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(filter.workOrderId ? { workOrderId: filter.workOrderId } : {}),
      },
      include: { items: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return inspections.map((i) => this.inspectionView(i));
  }

  /** Opens an inspection for a work order, copying the SKU's plan items. */
  async createInspection(
    input: { workOrderId: string },
    ctx: RequestContext,
  ): Promise<QcInspectionView> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: input.workOrderId, tenantId: ctx.tenantId },
    });
    if (!wo) throw notFound('WorkOrder', input.workOrderId);
    const plan = await this.prisma.qcPlan.findFirst({
      where: { tenantId: ctx.tenantId, skuId: wo.skuId, active: true },
      include: { items: true },
    });
    if (!plan) {
      throw new DomainError('INVALID_STATE', 'The SKU has no active QC plan');
    }
    const open = await this.prisma.qcInspection.findFirst({
      where: { tenantId: ctx.tenantId, workOrderId: wo.id, status: 'PENDING' },
    });
    if (open) throw new DomainError('CONFLICT', 'An inspection is already open for this order');

    const inspection = await this.prisma.$transaction(async (tx) => {
      const count = await tx.qcInspection.count({ where: { tenantId: ctx.tenantId } });
      const created = await tx.qcInspection.create({
        data: {
          tenantId: ctx.tenantId,
          inspectionNumber: `QCI-${String(count + 1).padStart(6, '0')}`,
          workOrderId: wo.id,
          skuId: wo.skuId,
          planId: plan.id,
          createdBy: ctx.userId ?? null,
          items: {
            create: plan.items.map((item) => ({
              tenantId: ctx.tenantId,
              seq: item.seq,
              name: item.name,
              requirement: item.requirement,
            })),
          },
        },
        include: { items: true },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.QC_INSPECTION_CREATED,
        aggregateType: 'QcInspection',
        aggregateId: created.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { inspectionId: created.id, workOrderId: wo.id },
      });
      return created;
    });
    return this.inspectionView(inspection);
  }

  /** Records one check's result while the inspection is pending. */
  async recordItem(
    input: {
      inspectionId: string;
      itemId: string;
      passed: boolean;
      note?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<QcInspectionView> {
    const inspection = await this.prisma.qcInspection.findFirst({
      where: { id: input.inspectionId, tenantId: ctx.tenantId },
    });
    if (!inspection) throw notFound('QcInspection', input.inspectionId);
    if (inspection.status !== 'PENDING') {
      throw new DomainError('INVALID_STATE', 'The inspection is already decided');
    }
    const updated = await this.prisma.qcInspectionItem.updateMany({
      where: { id: input.itemId, tenantId: ctx.tenantId, inspectionId: inspection.id },
      data: { passed: input.passed, note: input.note ?? null },
    });
    if (updated.count === 0) throw notFound('QcInspectionItem', input.itemId);
    return this.getInspection(inspection.id, ctx);
  }

  /**
   * Supervisor decision (VER-014): PASSED only when every item passed;
   * anything else fails and opens an NCR automatically. SoD: whoever
   * recorded results (createdBy) cannot also finalize.
   */
  async finalizeInspection(inspectionId: string, ctx: RequestContext): Promise<QcInspectionView> {
    const inspection = await this.prisma.qcInspection.findFirst({
      where: { id: inspectionId, tenantId: ctx.tenantId },
      include: { items: true },
    });
    if (!inspection) throw notFound('QcInspection', inspectionId);
    if (inspection.status !== 'PENDING') {
      throw new DomainError('INVALID_STATE', 'The inspection is already decided');
    }
    if (ctx.userId && inspection.createdBy && ctx.userId === inspection.createdBy) {
      throw new DomainError('FORBIDDEN', 'The inspector cannot finalize their own inspection');
    }
    if (inspection.items.some((i) => i.passed === null)) {
      throw new DomainError('VALIDATION_FAILED', 'Every check needs a recorded result first');
    }
    const allPassed = inspection.items.every((i) => i.passed === true);
    const status: QcInspectionStatus = allPassed ? 'PASSED' : 'FAILED';

    await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.qcInspection.updateMany({
        where: { id: inspection.id, tenantId: ctx.tenantId, status: 'PENDING' },
        data: { status, decidedBy: ctx.userId ?? null },
      });
      if (flipped.count === 0) throw new DomainError('CONFLICT', 'Inspection changed concurrently');
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'qc.inspection.finalize',
        objectType: 'QcInspection',
        objectId: inspection.id,
        source: 'api',
        newValues: { status },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: allPassed ? EVENT_TYPES.QC_PASSED : EVENT_TYPES.QC_FAILED,
        aggregateType: 'QcInspection',
        aggregateId: inspection.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { inspectionId: inspection.id, workOrderId: inspection.workOrderId },
      });
      if (!allPassed) {
        const failed = inspection.items.filter((i) => i.passed === false);
        const count = await tx.ncr.count({ where: { tenantId: ctx.tenantId } });
        const ncr = await tx.ncr.create({
          data: {
            tenantId: ctx.tenantId,
            ncrNumber: `NCR-${String(count + 1).padStart(5, '0')}`,
            workOrderId: inspection.workOrderId,
            skuId: inspection.skuId,
            description: `Inspection ${inspection.inspectionNumber} failed: ${failed
              .map((f) => f.name)
              .join(', ')}`,
            createdBy: ctx.userId ?? null,
          },
        });
        await publishToOutbox(tx, {
          tenantId: ctx.tenantId,
          eventType: EVENT_TYPES.NCR_CREATED,
          aggregateType: 'Ncr',
          aggregateId: ncr.id,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          payload: { ncrId: ncr.id, inspectionId: inspection.id },
        });
      }
    });
    return this.getInspection(inspection.id, ctx);
  }

  async getInspection(inspectionId: string, ctx: RequestContext): Promise<QcInspectionView> {
    const inspection = await this.prisma.qcInspection.findFirst({
      where: { id: inspectionId, tenantId: ctx.tenantId },
      include: { items: true },
    });
    if (!inspection) throw notFound('QcInspection', inspectionId);
    return this.inspectionView(inspection);
  }

  /**
   * Production-blocking gate (VER-013): what MES consults before
   * completing a work order for this SKU.
   */
  async getQcState(tenantId: string, workOrderId: string, skuId: string): Promise<QcState> {
    const plan = await this.prisma.qcPlan.findFirst({
      where: { tenantId, skuId, active: true },
    });
    if (!plan) return 'NOT_REQUIRED';
    const passed = await this.prisma.qcInspection.findFirst({
      where: { tenantId, workOrderId, status: 'PASSED' },
    });
    if (passed) return 'PASSED';
    const failed = await this.prisma.qcInspection.findFirst({
      where: { tenantId, workOrderId, status: 'FAILED' },
    });
    if (failed) return 'FAILED';
    return 'PENDING';
  }

  // ------------------------------------------------------------------- NCRs

  async listNcrs(ctx: RequestContext): Promise<NcrView[]> {
    const rows = await this.prisma.ncr.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return rows.map((n) => this.ncrView(n));
  }

  async createNcr(
    input: {
      skuId: string;
      description: string;
      severity?: NcrSeverity | undefined;
      workOrderId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<NcrView> {
    const sku = await this.prisma.sku.findFirst({
      where: { id: input.skuId, tenantId: ctx.tenantId },
    });
    if (!sku) throw notFound('Sku', input.skuId);
    const ncr = await this.prisma.$transaction(async (tx) => {
      const count = await tx.ncr.count({ where: { tenantId: ctx.tenantId } });
      const created = await tx.ncr.create({
        data: {
          tenantId: ctx.tenantId,
          ncrNumber: `NCR-${String(count + 1).padStart(5, '0')}`,
          skuId: input.skuId,
          workOrderId: input.workOrderId ?? null,
          description: input.description,
          severity: input.severity ?? 'MAJOR',
          createdBy: ctx.userId ?? null,
        },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.NCR_CREATED,
        aggregateType: 'Ncr',
        aggregateId: created.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { ncrId: created.id },
      });
      return created;
    });
    return this.ncrView(ncr);
  }

  async resolveNcr(
    input: { ncrId: string; resolution: string },
    ctx: RequestContext,
  ): Promise<NcrView> {
    if (!input.resolution.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'A resolution needs a description');
    }
    const flipped = await this.prisma.ncr.updateMany({
      where: { id: input.ncrId, tenantId: ctx.tenantId, status: 'OPEN' },
      data: {
        status: 'RESOLVED',
        resolution: input.resolution.trim(),
        resolvedBy: ctx.userId ?? null,
      },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', 'The NCR is already resolved or missing');
    }
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'qc.ncr.resolve',
        objectType: 'Ncr',
        objectId: input.ncrId,
        source: 'api',
        newValues: { resolution: input.resolution.trim() },
      });
    });
    const ncr = await this.prisma.ncr.findFirst({
      where: { id: input.ncrId, tenantId: ctx.tenantId },
    });
    return this.ncrView(ncr!);
  }

  // ---------------------------------------------------------------- mapping

  private planView(plan: {
    id: string;
    skuId: string;
    name: string;
    active: boolean;
    items: Array<{ id: string; seq: number; name: string; requirement: string }>;
  }): QcPlanView {
    return {
      id: plan.id,
      skuId: plan.skuId,
      name: plan.name,
      active: plan.active,
      items: plan.items
        .slice()
        .sort((a, b) => a.seq - b.seq)
        .map((i) => ({ id: i.id, seq: i.seq, name: i.name, requirement: i.requirement })),
    };
  }

  private inspectionView(inspection: {
    id: string;
    inspectionNumber: string;
    workOrderId: string;
    skuId: string;
    status: QcInspectionStatus;
    notes: string | null;
    items: Array<{
      id: string;
      seq: number;
      name: string;
      requirement: string;
      passed: boolean | null;
      note: string | null;
    }>;
  }): QcInspectionView {
    return {
      id: inspection.id,
      inspectionNumber: inspection.inspectionNumber,
      workOrderId: inspection.workOrderId,
      skuId: inspection.skuId,
      status: inspection.status,
      notes: inspection.notes,
      items: inspection.items
        .slice()
        .sort((a, b) => a.seq - b.seq)
        .map((i) => ({
          id: i.id,
          seq: i.seq,
          name: i.name,
          requirement: i.requirement,
          passed: i.passed,
          note: i.note,
        })),
    };
  }

  private ncrView(ncr: {
    id: string;
    ncrNumber: string;
    workOrderId: string | null;
    skuId: string;
    description: string;
    severity: NcrSeverity;
    status: NcrStatus;
    resolution: string | null;
  }): NcrView {
    return {
      id: ncr.id,
      ncrNumber: ncr.ncrNumber,
      workOrderId: ncr.workOrderId,
      skuId: ncr.skuId,
      description: ncr.description,
      severity: ncr.severity,
      status: ncr.status,
      resolution: ncr.resolution,
    };
  }
}

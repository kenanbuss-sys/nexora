import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * PRJ — project & job management (PRJ-001..012) as governed data on
 * the existing platform: projects, sites and milestones live as
 * governed custom objects (validated fields, audited records); costs,
 * timesheets, change orders and revenue ride the audit ledger with
 * idempotency markers; procurement and inventory link to the owning
 * domains (purchase orders read-only, stock issues through the
 * inventory ledger); documents are ordinary attachments on the
 * project record.
 */

const PRJ_OBJECTS: Array<{ key: string; name: string; fields: unknown }> = [
  {
    key: 'prj_project',
    name: 'Projekat',
    fields: [
      { key: 'code', label: 'Šifra', type: 'text', required: true },
      { key: 'naziv', label: 'Naziv', type: 'text', required: true },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        options: ['planiran', 'aktivan', 'zavrsen'],
      },
      { key: 'budzet', label: 'Budžet', type: 'number', required: true },
      { key: 'valuta', label: 'Valuta', type: 'text', required: false },
    ],
  },
  {
    key: 'prj_site',
    name: 'Gradilište',
    fields: [
      { key: 'projekt', label: 'Projekat', type: 'text', required: true },
      { key: 'naziv', label: 'Naziv', type: 'text', required: true },
      { key: 'adresa', label: 'Adresa', type: 'text', required: false },
    ],
  },
  {
    key: 'prj_milestone',
    name: 'Faza',
    fields: [
      { key: 'projekt', label: 'Projekat', type: 'text', required: true },
      { key: 'naziv', label: 'Naziv', type: 'text', required: true },
      { key: 'rok', label: 'Rok', type: 'date', required: false },
    ],
  },
];

export type CostKind = 'labor' | 'material' | 'subcontract' | 'other';
const COST_KINDS: ReadonlySet<string> = new Set(['labor', 'material', 'subcontract', 'other']);
const KEY_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Cross-domain contract: governed custom objects (owned by core). */
export interface ProjectObjectGate {
  defineObject(
    input: { key: string; name: string; fields: unknown },
    ctx: RequestContext,
  ): Promise<unknown>;
  listRecords(
    key: string,
    ctx: RequestContext,
  ): Promise<Array<{ id: string; data: unknown; createdAt: string }>>;
}

/** Cross-domain contract: tenant configuration (owned by core). */
export interface ProjectConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
}

/** Cross-domain contract: the stock ledger (owned by inventory). */
export interface ProjectInventoryGate {
  postMovement(
    input: {
      warehouseId: string;
      skuId: string;
      movementType: 'ISSUE';
      quantity: number;
      idempotencyKey: string;
    },
    ctx: RequestContext,
  ): Promise<unknown>;
}

export interface ProjectView {
  recordId: string;
  code: string;
  name: string;
  status: string;
  budget: number;
  currency: string;
}

export class ProjectService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly objects: ProjectObjectGate,
    private readonly configuration: ProjectConfigGate,
    private readonly inventory?: ProjectInventoryGate,
  ) {}

  /** PRJ-001/002/003: provision the project registers. Idempotent. */
  async setup(ctx: RequestContext): Promise<{ objects: string[] }> {
    const provisioned: string[] = [];
    for (const object of PRJ_OBJECTS) {
      try {
        await this.objects.defineObject(object, ctx);
        provisioned.push(object.key);
      } catch (error) {
        if (error instanceof DomainError && error.code === 'CONFLICT') {
          provisioned.push(object.key);
          continue;
        }
        throw error;
      }
    }
    return { objects: provisioned };
  }

  async projects(ctx: RequestContext): Promise<ProjectView[]> {
    const records = await this.objects.listRecords('prj_project', ctx);
    return records.map((record) => this.toView(record));
  }

  private toView(record: { id: string; data: unknown }): ProjectView {
    const data = (record.data ?? {}) as Record<string, unknown>;
    return {
      recordId: record.id,
      code: String(data.code ?? ''),
      name: String(data.naziv ?? ''),
      status: String(data.status ?? ''),
      budget: Number(data.budzet) || 0,
      currency: typeof data.valuta === 'string' ? data.valuta : 'EUR',
    };
  }

  private async project(code: string, ctx: RequestContext): Promise<ProjectView> {
    const match = (await this.projects(ctx)).find((p) => p.code === code);
    if (!match) throw notFound('Project', code);
    return match;
  }

  private async marked(action: string, objectId: string, tenantId: string) {
    return this.prisma.auditEvent.findFirst({
      where: { tenantId, action, objectType: 'Project', objectId },
      orderBy: { occurredAt: 'desc' },
    });
  }

  private async mark(
    action: string,
    objectId: string,
    newValues: Record<string, unknown>,
    ctx: RequestContext,
  ) {
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action,
      objectType: 'Project',
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
    });
  }

  // ----------------------------------------------- costing ledger (PRJ-005/008)

  /** Record a cost entry against a project. Idempotent per entry id. */
  async addCost(
    input: {
      projectCode: string;
      entryId: string;
      kind: string;
      amount: number;
      description: string;
    },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    if (!KEY_RE.test(input.entryId)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid entry id');
    }
    if (!COST_KINDS.has(input.kind)) {
      throw new DomainError('VALIDATION_FAILED', `Unknown cost kind '${input.kind}'`);
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new DomainError('VALIDATION_FAILED', 'Amount must be positive');
    }
    const project = await this.project(input.projectCode, ctx);
    const objectId = `${project.code}:cost:${input.entryId}`;
    if (await this.marked('prj.cost', objectId, ctx.tenantId)) {
      return { ok: true, duplicate: true };
    }
    await this.mark(
      'prj.cost',
      objectId,
      { kind: input.kind, amount: input.amount, description: input.description },
      ctx,
    );
    return { ok: true, duplicate: false };
  }

  // -------------------------------------------------------- timesheets (PRJ-009)

  /** One timesheet line per employee per project per day. Idempotent. */
  async recordTimesheet(
    input: { projectCode: string; employeeId: string; date: string; hours: number },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean; cost: string }> {
    if (!DATE_RE.test(input.date)) {
      throw new DomainError('VALIDATION_FAILED', 'Date must be YYYY-MM-DD');
    }
    if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > 24) {
      throw new DomainError('VALIDATION_FAILED', 'Hours must be between 0 and 24');
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, tenantId: ctx.tenantId },
    });
    if (!employee) throw notFound('Employee', input.employeeId);
    const project = await this.project(input.projectCode, ctx);
    const rate = await this.laborRate(ctx.tenantId);
    const cost = input.hours * rate;
    const objectId = `${project.code}:ts:${employee.id}:${input.date}`;
    const existing = await this.marked('prj.timesheet', objectId, ctx.tenantId);
    if (existing) {
      const prior = (existing.newValues as { cost?: number } | null)?.cost ?? 0;
      return { ok: true, duplicate: true, cost: prior.toFixed(2) };
    }
    await this.mark('prj.timesheet', objectId, { hours: input.hours, cost, rate }, ctx);
    return { ok: true, duplicate: false, cost: cost.toFixed(2) };
  }

  private async laborRate(tenantId: string): Promise<number> {
    const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
    const prj = ((config as Record<string, unknown>).prj ?? {}) as Record<string, unknown>;
    const rate = Number(prj.laborRate);
    return Number.isFinite(rate) && rate > 0 ? rate : 0;
  }

  // ------------------------------------------------ procurement link (PRJ-006)

  /** Link a purchase order to a project; its total joins the job cost. */
  async linkPurchaseOrder(
    input: { projectCode: string; purchaseOrderId: string },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    const project = await this.project(input.projectCode, ctx);
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, tenantId: ctx.tenantId },
    });
    if (!po) throw notFound('PurchaseOrder', input.purchaseOrderId);
    const objectId = `${project.code}:po:${po.id}`;
    if (await this.marked('prj.po.link', objectId, ctx.tenantId)) {
      return { ok: true, duplicate: true };
    }
    await this.mark('prj.po.link', objectId, { purchaseOrderId: po.id }, ctx);
    return { ok: true, duplicate: false };
  }

  // -------------------------------------------------- project inventory (PRJ-007)

  /** Issue material to a project through the stock ledger; costed. */
  async issueMaterial(
    input: {
      projectCode: string;
      warehouseId: string;
      skuId: string;
      quantity: number;
      unitCost: number;
      key: string;
    },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    if (!this.inventory) throw new DomainError('INVALID_STATE', 'Inventory is not wired');
    if (!KEY_RE.test(input.key)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid issue key');
    }
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    if (!Number.isFinite(input.unitCost) || input.unitCost < 0) {
      throw new DomainError('VALIDATION_FAILED', 'Unit cost must not be negative');
    }
    const project = await this.project(input.projectCode, ctx);
    const objectId = `${project.code}:cost:mat:${input.key}`;
    if (await this.marked('prj.cost', objectId, ctx.tenantId)) {
      return { ok: true, duplicate: true };
    }
    await this.inventory.postMovement(
      {
        warehouseId: input.warehouseId,
        skuId: input.skuId,
        movementType: 'ISSUE',
        quantity: input.quantity,
        idempotencyKey: `prj:${project.code}:${input.key}`,
      },
      ctx,
    );
    await this.mark(
      'prj.cost',
      objectId,
      {
        kind: 'material',
        amount: input.quantity * input.unitCost,
        description: `Izdato ${input.quantity} x ${input.skuId}`,
      },
      ctx,
    );
    return { ok: true, duplicate: false };
  }

  // ---------------------------------------------------- change orders (PRJ-011)

  /** A change order adjusts the effective budget. Idempotent per key. */
  async changeOrder(
    input: { projectCode: string; key: string; delta: number; reason: string },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    if (!KEY_RE.test(input.key)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid change-order key');
    }
    if (!Number.isFinite(input.delta) || input.delta === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Delta must be a non-zero number');
    }
    if (input.reason.trim().length < 5) {
      throw new DomainError('VALIDATION_FAILED', 'A change order needs a reason');
    }
    const project = await this.project(input.projectCode, ctx);
    const objectId = `${project.code}:co:${input.key}`;
    if (await this.marked('prj.change', objectId, ctx.tenantId)) {
      return { ok: true, duplicate: true };
    }
    await this.mark('prj.change', objectId, { delta: input.delta, reason: input.reason }, ctx);
    return { ok: true, duplicate: false };
  }

  // -------------------------------------------------------- revenue (PRJ-012)

  /** Latest recorded revenue wins (contract value / invoiced total). */
  async setRevenue(
    input: { projectCode: string; amount: number },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    if (!Number.isFinite(input.amount) || input.amount < 0) {
      throw new DomainError('VALIDATION_FAILED', 'Revenue must not be negative');
    }
    const project = await this.project(input.projectCode, ctx);
    await this.mark('prj.revenue', `${project.code}:revenue`, { amount: input.amount }, ctx);
    return { ok: true };
  }

  // ------------------------------------------------------ milestones (PRJ-003)

  /** Mark a milestone record done. Idempotent. */
  async completeMilestone(
    input: { projectCode: string; milestoneRecordId: string },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    const project = await this.project(input.projectCode, ctx);
    const milestones = await this.objects.listRecords('prj_milestone', ctx);
    const milestone = milestones.find(
      (m) =>
        m.id === input.milestoneRecordId &&
        ((m.data ?? {}) as Record<string, unknown>).projekt === project.code,
    );
    if (!milestone) throw notFound('Milestone', input.milestoneRecordId);
    const objectId = `${project.code}:ms:${milestone.id}`;
    if (await this.marked('prj.milestone.done', objectId, ctx.tenantId)) {
      return { ok: true, duplicate: true };
    }
    await this.mark('prj.milestone.done', objectId, {}, ctx);
    return { ok: true, duplicate: false };
  }

  async milestones(
    projectCode: string,
    ctx: RequestContext,
  ): Promise<Array<{ id: string; name: string; due: string | null; done: boolean }>> {
    const project = await this.project(projectCode, ctx);
    const records = await this.objects.listRecords('prj_milestone', ctx);
    const mine = records.filter(
      (m) => ((m.data ?? {}) as Record<string, unknown>).projekt === project.code,
    );
    const result = [];
    for (const record of mine) {
      const data = (record.data ?? {}) as Record<string, unknown>;
      const done = await this.marked(
        'prj.milestone.done',
        `${project.code}:ms:${record.id}`,
        ctx.tenantId,
      );
      result.push({
        id: record.id,
        name: String(data.naziv ?? ''),
        due: typeof data.rok === 'string' ? data.rok : null,
        done: done !== null,
      });
    }
    return result;
  }

  // ------------------------------------------- job costing & profit (PRJ-004/005/012)

  async costing(
    projectCode: string,
    ctx: RequestContext,
  ): Promise<{
    budget: string;
    changeOrders: string;
    effectiveBudget: string;
    costs: Record<CostKind, string>;
    procurement: string;
    totalCost: string;
    remaining: string;
  }> {
    const project = await this.project(projectCode, ctx);
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: { in: ['prj.cost', 'prj.timesheet', 'prj.change', 'prj.po.link'] },
        objectType: 'Project',
        objectId: { startsWith: `${project.code}:` },
      },
      orderBy: { occurredAt: 'asc' },
      take: 2000,
    });
    const costs: Record<CostKind, number> = { labor: 0, material: 0, subcontract: 0, other: 0 };
    let changes = 0;
    const poIds: string[] = [];
    for (const event of events) {
      const values = (event.newValues ?? {}) as Record<string, unknown>;
      if (event.action === 'prj.cost') {
        const kind = COST_KINDS.has(String(values.kind))
          ? (String(values.kind) as CostKind)
          : 'other';
        costs[kind] += Number(values.amount) || 0;
      } else if (event.action === 'prj.timesheet') {
        costs.labor += Number(values.cost) || 0;
      } else if (event.action === 'prj.change') {
        changes += Number(values.delta) || 0;
      } else if (event.action === 'prj.po.link' && typeof values.purchaseOrderId === 'string') {
        poIds.push(values.purchaseOrderId);
      }
    }
    let procurement = 0;
    if (poIds.length > 0) {
      const orders = await this.prisma.purchaseOrder.findMany({
        where: { tenantId: ctx.tenantId, id: { in: poIds } },
        select: { total: true },
      });
      procurement = orders.reduce((sum, po) => sum + Number(po.total), 0);
    }
    const totalCost = costs.labor + costs.material + costs.subcontract + costs.other + procurement;
    const effective = project.budget + changes;
    return {
      budget: project.budget.toFixed(2),
      changeOrders: changes.toFixed(2),
      effectiveBudget: effective.toFixed(2),
      costs: {
        labor: costs.labor.toFixed(2),
        material: costs.material.toFixed(2),
        subcontract: costs.subcontract.toFixed(2),
        other: costs.other.toFixed(2),
      },
      procurement: procurement.toFixed(2),
      totalCost: totalCost.toFixed(2),
      remaining: (effective - totalCost).toFixed(2),
    };
  }

  async profitability(
    projectCode: string,
    ctx: RequestContext,
  ): Promise<{ revenue: string; totalCost: string; profit: string; marginPct: string }> {
    const project = await this.project(projectCode, ctx);
    const summary = await this.costing(projectCode, ctx);
    const latest = await this.marked('prj.revenue', `${project.code}:revenue`, ctx.tenantId);
    const revenue = Number((latest?.newValues as { amount?: number } | null)?.amount ?? 0);
    const totalCost = Number(summary.totalCost);
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return {
      revenue: revenue.toFixed(2),
      totalCost: totalCost.toFixed(2),
      profit: profit.toFixed(2),
      marginPct: margin.toFixed(1),
    };
  }

  // ------------------------------------------------------ documents (PRJ-010)

  /** Attachments on the project record are the project's documents. */
  async documents(
    projectCode: string,
    ctx: RequestContext,
  ): Promise<Array<{ id: string; fileName: string; contentType: string; sizeBytes: number }>> {
    const project = await this.project(projectCode, ctx);
    const attachments = await this.prisma.attachment.findMany({
      where: { tenantId: ctx.tenantId, entityType: 'prj_project', entityId: project.recordId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
    }));
  }
}

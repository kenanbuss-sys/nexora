import { createHash } from 'node:crypto';
import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * SVC — field service (SVC-001..015): the installed base with
 * warranty, numbered service requests with SLA due dates from
 * configuration, service orders with scheduling, skills-based
 * assignment, customer approvals, measurements, ledger-backed parts,
 * proof of service, installation completion into the installed base,
 * RMAs and the full service history per asset.
 */

const ORDER_TRANSITIONS: Record<string, string[]> = {
  PLANNED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'PLANNED', 'CANCELLED'],
  IN_PROGRESS: ['DONE'],
  DONE: [],
  CANCELLED: [],
};

const RMA_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['RECEIVED'],
  RECEIVED: ['CLOSED'],
  REJECTED: [],
  CLOSED: [],
};

const PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const KEY_RE = /^[A-Za-z0-9._:-]{1,64}$/;

/** Cross-domain contract: tenant configuration (owned by core). */
export interface SvcConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
}

/** Cross-domain contract: the stock ledger (owned by inventory). */
export interface SvcInventoryGate {
  postMovement(
    input: {
      warehouseId: string;
      skuId: string;
      movementType: 'ISSUE' | 'RECEIPT';
      quantity: number;
      idempotencyKey: string;
    },
    ctx: RequestContext,
  ): Promise<unknown>;
}

/** Cross-domain contract: approvals (owned by WF). */
export interface SvcApprovalGate {
  requestApproval(
    input: { title: string; subjectObjectType: string; subjectObjectId: string },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
  getStatusFor(
    tenantId: string,
    subjectObjectType: string,
    subjectObjectId: string,
  ): Promise<'NONE' | 'REQUESTED' | 'GRANTED' | 'REJECTED'>;
}

export class FieldServiceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration: SvcConfigGate,
    private readonly inventory?: SvcInventoryGate,
    private readonly approvals?: SvcApprovalGate,
  ) {}

  private async svcConfig(tenantId: string): Promise<Record<string, unknown>> {
    const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
    return ((config as Record<string, unknown>).svc ?? {}) as Record<string, unknown>;
  }

  private async account(accountId: string, ctx: RequestContext) {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw notFound('CrmAccount', accountId);
    return account;
  }

  private async audit(
    action: string,
    objectType: string,
    objectId: string,
    newValues: Record<string, unknown>,
    ctx: RequestContext,
    reason?: string,
  ) {
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action,
      objectType,
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
      ...(reason !== undefined ? { reason } : {}),
    });
  }

  // ------------------------------------------- installed base (SVC-001/002)

  async createInstalledAsset(
    input: {
      accountId: string;
      name: string;
      skuId?: string | undefined;
      serial?: string | undefined;
      location?: string | undefined;
      installedAt?: string | undefined;
      warrantyUntil?: string | undefined;
    },
    ctx: RequestContext,
  ) {
    await this.account(input.accountId, ctx);
    if (input.skuId) {
      const sku = await this.prisma.sku.findFirst({
        where: { id: input.skuId, tenantId: ctx.tenantId },
      });
      if (!sku) throw notFound('Sku', input.skuId);
    }
    const asset = await this.prisma.installedAsset.create({
      data: {
        tenantId: ctx.tenantId,
        accountId: input.accountId,
        skuId: input.skuId ?? null,
        name: input.name.trim(),
        serial: input.serial?.trim() || null,
        location: input.location?.trim() || null,
        installedAt: input.installedAt ? new Date(input.installedAt) : null,
        warrantyUntil: input.warrantyUntil ? new Date(input.warrantyUntil) : null,
      },
    });
    await this.audit('svc.asset.create', 'InstalledAsset', asset.id, { name: asset.name }, ctx);
    return this.assetView(asset);
  }

  private assetView(asset: {
    id: string;
    accountId: string;
    skuId: string | null;
    name: string;
    serial: string | null;
    location: string | null;
    installedAt: Date | null;
    warrantyUntil: Date | null;
    active: boolean;
  }) {
    const now = new Date();
    return {
      id: asset.id,
      accountId: asset.accountId,
      skuId: asset.skuId,
      name: asset.name,
      serial: asset.serial,
      location: asset.location,
      installedAt: asset.installedAt?.toISOString() ?? null,
      warrantyUntil: asset.warrantyUntil?.toISOString() ?? null,
      inWarranty: asset.warrantyUntil !== null && asset.warrantyUntil > now,
      active: asset.active,
    };
  }

  async installedBase(accountId: string, ctx: RequestContext) {
    await this.account(accountId, ctx);
    const assets = await this.prisma.installedAsset.findMany({
      where: { tenantId: ctx.tenantId, accountId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return assets.map((a) => this.assetView(a));
  }

  /** SVC-002: warranties expiring within the configured notice window. */
  async warrantyReport(ctx: RequestContext) {
    const svc = await this.svcConfig(ctx.tenantId);
    const noticeDays = Number(svc.warrantyNoticeDays) > 0 ? Number(svc.warrantyNoticeDays) : 30;
    const now = new Date();
    const horizon = new Date(now.getTime() + noticeDays * 86400_000);
    const expiring = await this.prisma.installedAsset.findMany({
      where: {
        tenantId: ctx.tenantId,
        active: true,
        warrantyUntil: { gt: now, lte: horizon },
      },
      orderBy: { warrantyUntil: 'asc' },
      take: 500,
    });
    return {
      noticeDays,
      expiring: expiring.map((a) => ({
        id: a.id,
        name: a.name,
        warrantyUntil: a.warrantyUntil?.toISOString() ?? null,
      })),
    };
  }

  // ------------------------------------- service requests & SLA (SVC-003/014)

  async createRequest(
    input: {
      accountId: string;
      subject: string;
      priority?: string | undefined;
      installedAssetId?: string | undefined;
    },
    ctx: RequestContext,
  ) {
    await this.account(input.accountId, ctx);
    const priority = input.priority ?? 'NORMAL';
    if (!PRIORITIES.has(priority)) {
      throw new DomainError('VALIDATION_FAILED', `Unknown priority '${priority}'`);
    }
    if (input.installedAssetId) {
      const asset = await this.prisma.installedAsset.findFirst({
        where: { id: input.installedAssetId, tenantId: ctx.tenantId },
      });
      if (!asset) throw notFound('InstalledAsset', input.installedAssetId);
    }
    const svc = await this.svcConfig(ctx.tenantId);
    const slaHours = ((svc.sla ?? {}) as Record<string, unknown>)[priority];
    const slaDueAt =
      Number(slaHours) > 0 ? new Date(Date.now() + Number(slaHours) * 3600_000) : null;
    const request = await this.prisma.$transaction(async (tx) => {
      const count = await tx.serviceRequest.count({ where: { tenantId: ctx.tenantId } });
      return tx.serviceRequest.create({
        data: {
          tenantId: ctx.tenantId,
          requestNumber: `SR-${String(count + 1).padStart(6, '0')}`,
          accountId: input.accountId,
          installedAssetId: input.installedAssetId ?? null,
          subject: input.subject.trim(),
          priority,
          slaDueAt,
          createdBy: ctx.userId ?? null,
        },
      });
    });
    await this.audit(
      'svc.request.create',
      'ServiceRequest',
      request.id,
      { requestNumber: request.requestNumber, priority },
      ctx,
    );
    return this.requestView(request);
  }

  private requestView(r: {
    id: string;
    requestNumber: string;
    accountId: string;
    installedAssetId: string | null;
    subject: string;
    priority: string;
    status: string;
    slaDueAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: r.id,
      requestNumber: r.requestNumber,
      accountId: r.accountId,
      installedAssetId: r.installedAssetId,
      subject: r.subject,
      priority: r.priority,
      status: r.status,
      slaDueAt: r.slaDueAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  /** SVC-014: open requests against their SLA due dates. */
  async slaReport(ctx: RequestContext) {
    const open = await this.prisma.serviceRequest.findMany({
      where: { tenantId: ctx.tenantId, status: 'OPEN' },
      take: 1000,
    });
    const now = new Date();
    const overdue = open.filter((r) => r.slaDueAt !== null && r.slaDueAt < now);
    return {
      open: open.length,
      overdue: overdue.map((r) => ({
        requestNumber: r.requestNumber,
        subject: r.subject,
        slaDueAt: r.slaDueAt?.toISOString() ?? null,
      })),
    };
  }

  // ------------------------- service orders: lifecycle & scheduling (SVC-004/006)

  async createOrder(
    input: {
      accountId?: string | undefined;
      requestId?: string | undefined;
      installedAssetId?: string | undefined;
      skillsRequired?: string[] | undefined;
    },
    ctx: RequestContext,
  ) {
    let accountId = input.accountId ?? null;
    let requestId: string | null = null;
    if (input.requestId) {
      const request = await this.prisma.serviceRequest.findFirst({
        where: { id: input.requestId, tenantId: ctx.tenantId },
      });
      if (!request) throw notFound('ServiceRequest', input.requestId);
      requestId = request.id;
      accountId = request.accountId;
    }
    if (!accountId) {
      throw new DomainError('VALIDATION_FAILED', 'Provide accountId or requestId');
    }
    await this.account(accountId, ctx);
    if (input.installedAssetId) {
      const asset = await this.prisma.installedAsset.findFirst({
        where: { id: input.installedAssetId, tenantId: ctx.tenantId },
      });
      if (!asset) throw notFound('InstalledAsset', input.installedAssetId);
    }
    const order = await this.prisma.$transaction(async (tx) => {
      const count = await tx.serviceOrder.count({ where: { tenantId: ctx.tenantId } });
      return tx.serviceOrder.create({
        data: {
          tenantId: ctx.tenantId,
          orderNumber: `SVO-${String(count + 1).padStart(6, '0')}`,
          requestId,
          installedAssetId: input.installedAssetId ?? null,
          accountId,
          skillsRequired: (input.skillsRequired ?? []) as Prisma.InputJsonValue,
          createdBy: ctx.userId ?? null,
        },
      });
    });
    await this.audit(
      'svc.order.create',
      'ServiceOrder',
      order.id,
      { orderNumber: order.orderNumber },
      ctx,
    );
    return this.orderView(order);
  }

  private orderView(o: {
    id: string;
    orderNumber: string;
    requestId: string | null;
    installedAssetId: string | null;
    accountId: string;
    status: string;
    scheduledAt: Date | null;
    assignedTo: string | null;
    skillsRequired: unknown;
    report: string | null;
    proofName: string | null;
    createdAt: Date;
  }) {
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      requestId: o.requestId,
      installedAssetId: o.installedAssetId,
      accountId: o.accountId,
      status: o.status,
      scheduledAt: o.scheduledAt?.toISOString() ?? null,
      assignedTo: o.assignedTo,
      skillsRequired: Array.isArray(o.skillsRequired) ? (o.skillsRequired as string[]) : [],
      report: o.report,
      proofName: o.proofName,
      createdAt: o.createdAt.toISOString(),
    };
  }

  private async order(orderId: string, ctx: RequestContext) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
    });
    if (!order) throw notFound('ServiceOrder', orderId);
    return order;
  }

  /**
   * SVC-006/007: schedule the visit and assign a technician. The
   * employee must be ACTIVE, carry every required skill, and be free
   * in the two-hour slot around the appointment.
   */
  async schedule(
    input: { orderId: string; scheduledAt: string; employeeId: string },
    ctx: RequestContext,
  ) {
    const order = await this.order(input.orderId, ctx);
    if (order.status !== 'PLANNED' && order.status !== 'SCHEDULED') {
      throw new DomainError('INVALID_STATE', `Cannot schedule a ${order.status} order`);
    }
    const when = new Date(input.scheduledAt);
    if (Number.isNaN(when.getTime())) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid scheduledAt');
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, tenantId: ctx.tenantId },
    });
    if (!employee) throw notFound('Employee', input.employeeId);
    if (employee.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', 'The technician is not active');
    }
    const required = Array.isArray(order.skillsRequired) ? (order.skillsRequired as string[]) : [];
    const skills = new Set(Array.isArray(employee.skills) ? (employee.skills as string[]) : []);
    const missing = required.filter((skill) => !skills.has(skill));
    if (missing.length > 0) {
      throw new DomainError('INVALID_STATE', `The technician lacks skills: ${missing.join(', ')}`, {
        missing,
      });
    }
    // Two-hour slot conflict check for the same technician.
    const slotStart = new Date(when.getTime() - 2 * 3600_000);
    const slotEnd = new Date(when.getTime() + 2 * 3600_000);
    const clash = await this.prisma.serviceOrder.findFirst({
      where: {
        tenantId: ctx.tenantId,
        id: { not: order.id },
        assignedTo: employee.id,
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        scheduledAt: { gt: slotStart, lt: slotEnd },
      },
    });
    if (clash) {
      throw new DomainError('CONFLICT', 'The technician already has a visit in this slot', {
        conflictingOrder: clash.orderNumber,
      });
    }
    const updated = await this.prisma.serviceOrder.update({
      where: { id: order.id },
      data: { status: 'SCHEDULED', scheduledAt: when, assignedTo: employee.id },
    });
    await this.audit(
      'svc.order.schedule',
      'ServiceOrder',
      order.id,
      { scheduledAt: when.toISOString(), employeeId: employee.id },
      ctx,
    );
    return this.orderView(updated);
  }

  // --------------------------------------- customer approval & start (SVC-013)

  /** SVC-013: ask the customer to approve the work before it starts. */
  async requestCustomerApproval(orderId: string, ctx: RequestContext) {
    if (!this.approvals) throw new DomainError('INVALID_STATE', 'Approvals are not wired');
    const order = await this.order(orderId, ctx);
    if (order.status === 'DONE' || order.status === 'CANCELLED') {
      throw new DomainError('INVALID_STATE', 'The order is closed');
    }
    const status = await this.approvals.getStatusFor(ctx.tenantId, 'svc_order', order.id);
    if (status !== 'NONE') {
      throw new DomainError('CONFLICT', `An approval is already ${status}`);
    }
    const approval = await this.approvals.requestApproval(
      {
        title: `Saglasnost kupca: ${order.orderNumber}`,
        subjectObjectType: 'svc_order',
        subjectObjectId: order.id,
      },
      ctx,
    );
    return { approvalId: approval.id };
  }

  async start(orderId: string, ctx: RequestContext) {
    const order = await this.order(orderId, ctx);
    if (order.status !== 'SCHEDULED') {
      throw new DomainError('INVALID_STATE', `Cannot start a ${order.status} order`);
    }
    const svc = await this.svcConfig(ctx.tenantId);
    if (svc.requireCustomerApproval === true) {
      if (!this.approvals) throw new DomainError('INVALID_STATE', 'Approvals are not wired');
      const status = await this.approvals.getStatusFor(ctx.tenantId, 'svc_order', order.id);
      if (status !== 'GRANTED') {
        throw new DomainError('INVALID_STATE', 'Customer approval is required before work starts', {
          approvalStatus: status,
        });
      }
    }
    const updated = await this.prisma.serviceOrder.update({
      where: { id: order.id },
      data: { status: 'IN_PROGRESS' },
    });
    await this.audit('svc.order.start', 'ServiceOrder', order.id, {}, ctx);
    return this.orderView(updated);
  }

  // ------------------------------- field mobile: my orders (SVC-008)

  /** The signed-in technician's open orders, soonest first. */
  async myOrders(ctx: RequestContext) {
    if (!ctx.userId) return [];
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: ctx.tenantId, userId: ctx.userId },
    });
    if (!employee) return [];
    const orders = await this.prisma.serviceOrder.findMany({
      where: {
        tenantId: ctx.tenantId,
        assignedTo: employee.id,
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
    });
    return orders.map((o) => this.orderView(o));
  }

  // ----------------------------------- measurements & surveys (SVC-009)

  async recordMeasurement(
    input: { orderId: string; key: string; value: string; unit?: string | undefined },
    ctx: RequestContext,
  ) {
    if (!KEY_RE.test(input.key)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid measurement key');
    }
    const order = await this.order(input.orderId, ctx);
    if (order.status !== 'IN_PROGRESS') {
      throw new DomainError('INVALID_STATE', 'Measurements are recorded during the visit');
    }
    await this.audit(
      'svc.measurement',
      'ServiceOrder',
      `${order.id}:m:${input.key}`,
      { value: input.value, unit: input.unit ?? null },
      ctx,
    );
    return { ok: true as const };
  }

  async measurements(orderId: string, ctx: RequestContext) {
    const order = await this.order(orderId, ctx);
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: 'svc.measurement',
        objectType: 'ServiceOrder',
        objectId: { startsWith: `${order.id}:m:` },
      },
      orderBy: { occurredAt: 'asc' },
      take: 200,
    });
    return events.map((e) => ({
      key: e.objectId.slice(`${order.id}:m:`.length),
      value: String((e.newValues as { value?: unknown } | null)?.value ?? ''),
      unit: ((e.newValues as { unit?: string | null } | null)?.unit ?? null) as string | null,
      at: e.occurredAt.toISOString(),
    }));
  }

  // ------------------------------------------- service parts (SVC-012)

  /** Consume a part on the order; stock leaves through the ledger. */
  async addPart(
    input: {
      orderId: string;
      skuId: string;
      warehouseId: string;
      quantity: number;
      key: string;
    },
    ctx: RequestContext,
  ) {
    if (!this.inventory) throw new DomainError('INVALID_STATE', 'Inventory is not wired');
    if (!KEY_RE.test(input.key)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid part key');
    }
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    const order = await this.order(input.orderId, ctx);
    if (order.status !== 'IN_PROGRESS') {
      throw new DomainError('INVALID_STATE', 'Parts are consumed during the visit');
    }
    const marker = `${order.id}:part:${input.key}`;
    const existing = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'svc.part.consume',
        objectType: 'ServiceOrder',
        objectId: marker,
      },
    });
    if (existing) return { ok: true as const, duplicate: true };
    await this.inventory.postMovement(
      {
        warehouseId: input.warehouseId,
        skuId: input.skuId,
        movementType: 'ISSUE',
        quantity: input.quantity,
        idempotencyKey: `svc:${order.id}:${input.key}`,
      },
      ctx,
    );
    await this.prisma.serviceOrderPart.create({
      data: {
        tenantId: ctx.tenantId,
        serviceOrderId: order.id,
        skuId: input.skuId,
        quantity: input.quantity,
      },
    });
    await this.audit(
      'svc.part.consume',
      'ServiceOrder',
      marker,
      { skuId: input.skuId, quantity: input.quantity },
      ctx,
    );
    return { ok: true as const, duplicate: false };
  }

  // --------------------------- proof of service & completion (SVC-010/011)

  /** SVC-011: the customer signs off with a name and a PIN. Once. */
  async recordProof(input: { orderId: string; name: string; pin: string }, ctx: RequestContext) {
    if (input.name.trim().length === 0 || !/^\d{4,8}$/.test(input.pin)) {
      throw new DomainError('VALIDATION_FAILED', 'A name and a 4-8 digit PIN are required');
    }
    const order = await this.order(input.orderId, ctx);
    if (order.status !== 'IN_PROGRESS' && order.status !== 'DONE') {
      throw new DomainError('INVALID_STATE', 'Proof is recorded during or after the visit');
    }
    if (order.proofSignatureHash) {
      throw new DomainError('CONFLICT', 'Proof of service is already recorded');
    }
    const hash = createHash('sha256')
      .update(`${order.id}:${input.name.trim()}:${input.pin}`)
      .digest('hex');
    await this.prisma.serviceOrder.update({
      where: { id: order.id },
      data: { proofName: input.name.trim(), proofSignatureHash: hash },
    });
    await this.audit(
      'svc.order.proof',
      'ServiceOrder',
      order.id,
      { proofName: input.name.trim() },
      ctx,
    );
    return { ok: true as const };
  }

  /**
   * Complete the visit. SVC-010: an installation order hands a new
   * asset to the installed base on completion.
   */
  async complete(
    input: {
      orderId: string;
      report: string;
      install?:
        | {
            name: string;
            skuId?: string | undefined;
            serial?: string | undefined;
            warrantyMonths?: number | undefined;
          }
        | undefined;
    },
    ctx: RequestContext,
  ) {
    if (input.report.trim().length < 5) {
      throw new DomainError('VALIDATION_FAILED', 'A completion report is required');
    }
    const order = await this.order(input.orderId, ctx);
    if (order.status !== 'IN_PROGRESS') {
      throw new DomainError('INVALID_STATE', `Cannot complete a ${order.status} order`);
    }
    let installedAssetId: string | null = null;
    if (input.install) {
      const warrantyMonths =
        Number(input.install.warrantyMonths) > 0 ? Number(input.install.warrantyMonths) : 0;
      const warrantyUntil =
        warrantyMonths > 0
          ? new Date(new Date().setMonth(new Date().getMonth() + warrantyMonths))
          : undefined;
      const created = await this.createInstalledAsset(
        {
          accountId: order.accountId,
          name: input.install.name,
          skuId: input.install.skuId,
          serial: input.install.serial,
          installedAt: new Date().toISOString(),
          ...(warrantyUntil ? { warrantyUntil: warrantyUntil.toISOString() } : {}),
        },
        ctx,
      );
      installedAssetId = created.id;
    }
    const updated = await this.prisma.serviceOrder.update({
      where: { id: order.id },
      data: {
        status: 'DONE',
        report: input.report.trim(),
        // An installation order without an asset link points at what
        // it installed; a repair keeps its original asset.
        ...(installedAssetId && !order.installedAssetId ? { installedAssetId } : {}),
      },
    });
    if (order.requestId) {
      await this.prisma.serviceRequest.updateMany({
        where: { id: order.requestId, tenantId: ctx.tenantId, status: 'OPEN' },
        data: { status: 'RESOLVED' },
      });
    }
    await this.audit('svc.order.complete', 'ServiceOrder', order.id, { installedAssetId }, ctx);
    return this.orderView(updated);
  }

  async cancel(orderId: string, reason: string, ctx: RequestContext) {
    if (reason.trim().length < 5) {
      throw new DomainError('VALIDATION_FAILED', 'A cancellation needs a reason');
    }
    const order = await this.order(orderId, ctx);
    if (!ORDER_TRANSITIONS[order.status]?.includes('CANCELLED')) {
      throw new DomainError('INVALID_STATE', `Cannot cancel a ${order.status} order`);
    }
    const updated = await this.prisma.serviceOrder.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    });
    await this.audit('svc.order.cancel', 'ServiceOrder', order.id, {}, ctx, reason);
    return this.orderView(updated);
  }

  // --------------------------------------------------------- RMA (SVC-005)

  async createRma(
    input: {
      accountId: string;
      skuId: string;
      quantity: number;
      reason: string;
      orderId?: string | undefined;
    },
    ctx: RequestContext,
  ) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    if (input.reason.trim().length < 5) {
      throw new DomainError('VALIDATION_FAILED', 'An RMA needs a reason');
    }
    await this.account(input.accountId, ctx);
    const sku = await this.prisma.sku.findFirst({
      where: { id: input.skuId, tenantId: ctx.tenantId },
    });
    if (!sku) throw notFound('Sku', input.skuId);
    if (input.orderId) {
      const order = await this.prisma.salesOrder.findFirst({
        where: { id: input.orderId, tenantId: ctx.tenantId },
      });
      if (!order) throw notFound('SalesOrder', input.orderId);
    }
    const rma = await this.prisma.$transaction(async (tx) => {
      const count = await tx.rma.count({ where: { tenantId: ctx.tenantId } });
      return tx.rma.create({
        data: {
          tenantId: ctx.tenantId,
          rmaNumber: `RMA-${String(count + 1).padStart(6, '0')}`,
          accountId: input.accountId,
          orderId: input.orderId ?? null,
          skuId: input.skuId,
          quantity: input.quantity,
          reason: input.reason.trim(),
          createdBy: ctx.userId ?? null,
        },
      });
    });
    await this.audit('svc.rma.create', 'Rma', rma.id, { rmaNumber: rma.rmaNumber }, ctx);
    return this.rmaView(rma);
  }

  private rmaView(r: {
    id: string;
    rmaNumber: string;
    accountId: string;
    orderId: string | null;
    skuId: string;
    quantity: Prisma.Decimal;
    reason: string;
    status: string;
    createdAt: Date;
  }) {
    return {
      id: r.id,
      rmaNumber: r.rmaNumber,
      accountId: r.accountId,
      orderId: r.orderId,
      skuId: r.skuId,
      quantity: Number(r.quantity),
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  }

  /**
   * RMA lifecycle; receiving the goods books them back into stock
   * through the ledger (idempotent per RMA).
   */
  async transitionRma(
    input: { rmaId: string; status: string; warehouseId?: string | undefined },
    ctx: RequestContext,
  ) {
    const rma = await this.prisma.rma.findFirst({
      where: { id: input.rmaId, tenantId: ctx.tenantId },
    });
    if (!rma) throw notFound('Rma', input.rmaId);
    if (!RMA_TRANSITIONS[rma.status]?.includes(input.status)) {
      throw new DomainError(
        'INVALID_STATE',
        `Cannot move an RMA from ${rma.status} to ${input.status}`,
      );
    }
    if (input.status === 'RECEIVED') {
      if (!this.inventory) throw new DomainError('INVALID_STATE', 'Inventory is not wired');
      if (!input.warehouseId) {
        throw new DomainError('VALIDATION_FAILED', 'Receiving an RMA needs a warehouse');
      }
      await this.inventory.postMovement(
        {
          warehouseId: input.warehouseId,
          skuId: rma.skuId,
          movementType: 'RECEIPT',
          quantity: Number(rma.quantity),
          idempotencyKey: `rma:${rma.id}`,
        },
        ctx,
      );
    }
    const updated = await this.prisma.rma.update({
      where: { id: rma.id },
      data: { status: input.status },
    });
    await this.audit(
      'svc.rma.transition',
      'Rma',
      rma.id,
      { from: rma.status, to: input.status },
      ctx,
    );
    return this.rmaView(updated);
  }

  // ------------------------------------------- service history (SVC-015)

  /** Everything that ever happened to an installed asset. */
  async history(installedAssetId: string, ctx: RequestContext) {
    const asset = await this.prisma.installedAsset.findFirst({
      where: { id: installedAssetId, tenantId: ctx.tenantId },
    });
    if (!asset) throw notFound('InstalledAsset', installedAssetId);
    const requests = await this.prisma.serviceRequest.findMany({
      where: { tenantId: ctx.tenantId, installedAssetId: asset.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const orders = await this.prisma.serviceOrder.findMany({
      where: { tenantId: ctx.tenantId, installedAssetId: asset.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { parts: true },
    });
    return {
      asset: this.assetView(asset),
      requests: requests.map((r) => this.requestView(r)),
      orders: orders.map((o) => ({
        ...this.orderView(o),
        parts: o.parts.map((p) => ({ skuId: p.skuId, quantity: Number(p.quantity) })),
      })),
    };
  }
}

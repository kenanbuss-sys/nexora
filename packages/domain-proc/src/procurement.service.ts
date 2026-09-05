import { writeAudit } from '@nexora/audit';
import type {
  PrismaClient,
  PurchaseOrderStatus,
  RequisitionStatus,
  SupplierStatus,
} from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Procurement — supplier master (PROC-001), purchase requisitions with
 * threshold-based approvals through WF (PROC-002/003), purchase orders
 * (PROC-005), and receiving that posts RECEIPT ledger movements through
 * the WMS public interface (PROC-009). Purchase price history derives
 * from PO lines (PROC-013).
 *
 * Requisition: DRAFT -> (submit) -> APPROVED | PENDING_APPROVAL ->
 * APPROVED/REJECTED -> (convert) -> CONVERTED.
 * PO: OPEN -> PARTIALLY_RECEIVED -> RECEIVED, or CANCELLED while OPEN.
 */

/** Requisitions above this total route through a WF approval (PROC-003). */
export const REQUISITION_APPROVAL_THRESHOLD = 1000;

export interface SupplierView {
  id: string;
  supplierNumber: string;
  partyId: string;
  partyName: string;
  status: SupplierStatus;
  leadTimeDays: number | null;
}

export interface RequisitionLineView {
  id: string;
  skuId: string;
  description: string;
  quantity: string;
  estUnitPrice: string;
  lineTotal: string;
}

export interface RequisitionView {
  id: string;
  requisitionNumber: string;
  status: RequisitionStatus;
  currency: string;
  total: string;
  note: string | null;
  approvalId: string | null;
  lines: RequisitionLineView[];
}

export interface PoLineView {
  id: string;
  skuId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  receivedQty: string;
}

export interface PurchaseOrderView {
  id: string;
  poNumber: string;
  supplierId: string;
  warehouseId: string;
  requisitionId: string | null;
  status: PurchaseOrderStatus;
  currency: string;
  total: string;
  expectedAt: string | null;
  lines: PoLineView[];
}

export interface PriceHistoryEntry {
  poNumber: string;
  supplierId: string;
  unitPrice: string;
  currency: string;
  orderedAt: string;
}

/** Cross-domain contract: party identity is owned by MDM. */
export interface PartyGate {
  getPartyState(
    tenantId: string,
    partyId: string,
  ): Promise<{ exists: boolean; active: boolean; name: string } | null>;
  createOrganization(
    tenantId: string,
    name: string,
    email?: string | undefined,
  ): Promise<{ partyId: string }>;
}

/** Cross-domain contract: approvals are owned by WF. */
export interface ApprovalGate {
  requestApproval(
    input: { title: string; subjectObjectType: string; subjectObjectId: string },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
  getApprovalStatus(
    tenantId: string,
    approvalId: string,
  ): Promise<'REQUESTED' | 'GRANTED' | 'REJECTED' | null>;
}

/** Cross-domain contract: SKU identity is owned by PIM. */
export interface SkuInfoGate {
  getSkuInfo(
    tenantId: string,
    skuId: string,
  ): Promise<{ exists: boolean; active: boolean; code: string; name: string } | null>;
}

/** Cross-domain contract: stock truth is owned by WMS. */
export interface ReceiptGate {
  postMovement(
    input: {
      warehouseId: string;
      skuId: string;
      movementType: 'RECEIPT';
      quantity: number;
      idempotencyKey: string;
      reason?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ movementId: string; duplicate: boolean }>;
}

function requisitionView(r: {
  id: string;
  requisitionNumber: string;
  status: RequisitionStatus;
  currency: string;
  total: { toString(): string };
  note: string | null;
  approvalId: string | null;
  lines: Array<{
    id: string;
    skuId: string;
    description: string;
    quantity: { toString(): string };
    estUnitPrice: { toString(): string };
    lineTotal: { toString(): string };
  }>;
}): RequisitionView {
  return {
    id: r.id,
    requisitionNumber: r.requisitionNumber,
    status: r.status,
    currency: r.currency,
    total: r.total.toString(),
    note: r.note,
    approvalId: r.approvalId,
    lines: r.lines.map((l) => ({
      id: l.id,
      skuId: l.skuId,
      description: l.description,
      quantity: l.quantity.toString(),
      estUnitPrice: l.estUnitPrice.toString(),
      lineTotal: l.lineTotal.toString(),
    })),
  };
}

function poView(po: {
  id: string;
  poNumber: string;
  supplierId: string;
  warehouseId: string;
  requisitionId: string | null;
  status: PurchaseOrderStatus;
  currency: string;
  total: { toString(): string };
  expectedAt: Date | null;
  lines: Array<{
    id: string;
    skuId: string;
    description: string;
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    lineTotal: { toString(): string };
    receivedQty: { toString(): string };
  }>;
}): PurchaseOrderView {
  return {
    id: po.id,
    poNumber: po.poNumber,
    supplierId: po.supplierId,
    warehouseId: po.warehouseId,
    requisitionId: po.requisitionId,
    status: po.status,
    currency: po.currency,
    total: po.total.toString(),
    expectedAt: po.expectedAt ? po.expectedAt.toISOString() : null,
    lines: po.lines.map((l) => ({
      id: l.id,
      skuId: l.skuId,
      description: l.description,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
      lineTotal: l.lineTotal.toString(),
      receivedQty: l.receivedQty.toString(),
    })),
  };
}

export class ProcurementService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly parties: PartyGate,
    private readonly approvals: ApprovalGate,
    private readonly skus: SkuInfoGate,
    private readonly receipts: ReceiptGate,
  ) {}

  // -------------------------------------------------------------- suppliers

  async listSuppliers(ctx: RequestContext): Promise<SupplierView[]> {
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    const views: SupplierView[] = [];
    for (const s of suppliers) {
      const party = await this.parties.getPartyState(ctx.tenantId, s.partyId);
      views.push({
        id: s.id,
        supplierNumber: s.supplierNumber,
        partyId: s.partyId,
        partyName: party?.name ?? '(unknown party)',
        status: s.status,
        leadTimeDays: s.leadTimeDays,
      });
    }
    return views;
  }

  /** Creates the MDM party through the owning domain, then the supplier. */
  async createSupplier(
    input: { name: string; email?: string | undefined; leadTimeDays?: number | undefined },
    ctx: RequestContext,
  ): Promise<SupplierView> {
    if (input.leadTimeDays !== undefined && input.leadTimeDays < 0) {
      throw new DomainError('VALIDATION_FAILED', 'Lead time cannot be negative');
    }
    const { partyId } = await this.parties.createOrganization(
      ctx.tenantId,
      input.name,
      input.email,
    );
    const supplier = await this.prisma.$transaction(async (tx) => {
      const count = await tx.supplier.count({ where: { tenantId: ctx.tenantId } });
      const created = await tx.supplier.create({
        data: {
          tenantId: ctx.tenantId,
          partyId,
          supplierNumber: `SUP-${String(count + 1).padStart(5, '0')}`,
          leadTimeDays: input.leadTimeDays ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'proc.supplier.create',
        objectType: 'Supplier',
        objectId: created.id,
        source: 'api',
        newValues: { supplierNumber: created.supplierNumber, partyId },
      });
      return created;
    });
    return {
      id: supplier.id,
      supplierNumber: supplier.supplierNumber,
      partyId,
      partyName: input.name,
      status: supplier.status,
      leadTimeDays: supplier.leadTimeDays,
    };
  }

  async setSupplierStatus(
    supplierId: string,
    status: SupplierStatus,
    ctx: RequestContext,
  ): Promise<void> {
    const updated = await this.prisma.supplier.updateMany({
      where: { id: supplierId, tenantId: ctx.tenantId },
      data: { status },
    });
    if (updated.count === 0) throw notFound('Supplier', supplierId);
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'proc.supplier.set_status',
        objectType: 'Supplier',
        objectId: supplierId,
        source: 'api',
        newValues: { status },
      });
    });
  }

  // ----------------------------------------------------------- requisitions

  async listRequisitions(ctx: RequestContext): Promise<RequisitionView[]> {
    const rows = await this.prisma.purchaseRequisition.findMany({
      where: { tenantId: ctx.tenantId },
      include: { lines: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return rows.map(requisitionView);
  }

  async createRequisition(
    input: { currency: string; note?: string | undefined },
    ctx: RequestContext,
  ): Promise<RequisitionView> {
    if (!/^[A-Z]{3}$/.test(input.currency)) {
      throw new DomainError('VALIDATION_FAILED', 'Currency must be a 3-letter ISO code');
    }
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.purchaseRequisition.count({ where: { tenantId: ctx.tenantId } });
      const requisition = await tx.purchaseRequisition.create({
        data: {
          tenantId: ctx.tenantId,
          requisitionNumber: `PR-${String(count + 1).padStart(6, '0')}`,
          currency: input.currency,
          note: input.note ?? null,
          createdBy: ctx.userId ?? null,
        },
        include: { lines: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'proc.requisition.create',
        objectType: 'PurchaseRequisition',
        objectId: requisition.id,
        source: 'api',
        newValues: { requisitionNumber: requisition.requisitionNumber },
      });
      return requisitionView(requisition);
    });
  }

  async addRequisitionLine(
    input: { requisitionId: string; skuId: string; quantity: number; estUnitPrice: number },
    ctx: RequestContext,
  ): Promise<RequisitionView> {
    if (!(input.quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    if (!(input.estUnitPrice >= 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Estimated price must be zero or positive');
    }
    const requisition = await this.prisma.purchaseRequisition.findFirst({
      where: { id: input.requisitionId, tenantId: ctx.tenantId },
    });
    if (!requisition) throw notFound('PurchaseRequisition', input.requisitionId);
    if (requisition.status !== 'DRAFT') {
      throw new DomainError(
        'INVALID_STATE',
        'Lines can only change while the requisition is a draft',
      );
    }
    const sku = await this.skus.getSkuInfo(ctx.tenantId, input.skuId);
    if (!sku || !sku.exists) throw notFound('Sku', input.skuId);

    const lineTotal = Math.round(input.estUnitPrice * input.quantity * 100) / 100;
    await this.prisma.purchaseRequisitionLine.create({
      data: {
        tenantId: ctx.tenantId,
        requisitionId: requisition.id,
        skuId: input.skuId,
        description: `${sku.code} — ${sku.name}`,
        quantity: input.quantity,
        estUnitPrice: input.estUnitPrice,
        lineTotal,
      },
    });
    await this.recomputeRequisitionTotal(requisition.id, ctx);
    return this.getRequisition(requisition.id, ctx);
  }

  async getRequisition(requisitionId: string, ctx: RequestContext): Promise<RequisitionView> {
    const requisition = await this.prisma.purchaseRequisition.findFirst({
      where: { id: requisitionId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!requisition) throw notFound('PurchaseRequisition', requisitionId);
    return requisitionView(requisition);
  }

  /**
   * Submits a draft (PROC-002). Totals above the threshold request a WF
   * approval (PROC-003); smaller ones are approved directly.
   */
  async submitRequisition(requisitionId: string, ctx: RequestContext): Promise<RequisitionView> {
    const requisition = await this.prisma.purchaseRequisition.findFirst({
      where: { id: requisitionId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!requisition) throw notFound('PurchaseRequisition', requisitionId);
    if (requisition.status !== 'DRAFT') {
      throw new DomainError('INVALID_STATE', 'Requisition is not a draft');
    }
    if (requisition.lines.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'A requisition needs at least one line');
    }
    const needsApproval = Number(requisition.total) > REQUISITION_APPROVAL_THRESHOLD;
    if (needsApproval) {
      const approval = await this.approvals.requestApproval(
        {
          title: `Purchase ${requisition.requisitionNumber} for ${requisition.total} ${requisition.currency} (threshold ${REQUISITION_APPROVAL_THRESHOLD})`,
          subjectObjectType: 'PurchaseRequisition',
          subjectObjectId: requisition.id,
        },
        ctx,
      );
      const flipped = await this.prisma.purchaseRequisition.updateMany({
        where: { id: requisition.id, tenantId: ctx.tenantId, status: 'DRAFT' },
        data: { status: 'PENDING_APPROVAL', approvalId: approval.id },
      });
      if (flipped.count === 0)
        throw new DomainError('CONFLICT', 'Requisition changed concurrently');
    } else {
      const flipped = await this.prisma.purchaseRequisition.updateMany({
        where: { id: requisition.id, tenantId: ctx.tenantId, status: 'DRAFT' },
        data: { status: 'APPROVED' },
      });
      if (flipped.count === 0)
        throw new DomainError('CONFLICT', 'Requisition changed concurrently');
      await this.emitPurchaseEvent(EVENT_TYPES.PURCHASE_APPROVED, requisition.id, ctx);
    }
    await this.emitPurchaseEvent(EVENT_TYPES.PURCHASE_REQUESTED, requisition.id, ctx);
    return this.getRequisition(requisition.id, ctx);
  }

  /** Applies the WF approval outcome to a PENDING_APPROVAL requisition. */
  async syncRequisitionApproval(
    requisitionId: string,
    ctx: RequestContext,
  ): Promise<RequisitionView> {
    const requisition = await this.prisma.purchaseRequisition.findFirst({
      where: { id: requisitionId, tenantId: ctx.tenantId },
    });
    if (!requisition) throw notFound('PurchaseRequisition', requisitionId);
    if (requisition.status !== 'PENDING_APPROVAL' || !requisition.approvalId) {
      throw new DomainError('INVALID_STATE', 'Requisition is not waiting for approval');
    }
    const status = await this.approvals.getApprovalStatus(ctx.tenantId, requisition.approvalId);
    if (status === 'GRANTED') {
      await this.prisma.purchaseRequisition.updateMany({
        where: { id: requisition.id, tenantId: ctx.tenantId, status: 'PENDING_APPROVAL' },
        data: { status: 'APPROVED' },
      });
      await this.emitPurchaseEvent(EVENT_TYPES.PURCHASE_APPROVED, requisition.id, ctx);
    } else if (status === 'REJECTED') {
      await this.prisma.purchaseRequisition.updateMany({
        where: { id: requisition.id, tenantId: ctx.tenantId, status: 'PENDING_APPROVAL' },
        data: { status: 'REJECTED' },
      });
    }
    return this.getRequisition(requisition.id, ctx);
  }

  // -------------------------------------------------------- purchase orders

  async listPurchaseOrders(ctx: RequestContext): Promise<PurchaseOrderView[]> {
    const rows = await this.prisma.purchaseOrder.findMany({
      where: { tenantId: ctx.tenantId },
      include: { lines: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return rows.map(poView);
  }

  async getPurchaseOrder(poId: string, ctx: RequestContext): Promise<PurchaseOrderView> {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!po) throw notFound('PurchaseOrder', poId);
    return poView(po);
  }

  /**
   * Converts an APPROVED requisition into a PO for one supplier
   * (PROC-005). The requisition flips to CONVERTED exactly once.
   */
  async createPoFromRequisition(
    input: {
      requisitionId: string;
      supplierId: string;
      warehouseId: string;
      expectedAt?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<PurchaseOrderView> {
    const requisition = await this.prisma.purchaseRequisition.findFirst({
      where: { id: input.requisitionId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!requisition) throw notFound('PurchaseRequisition', input.requisitionId);
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: input.supplierId, tenantId: ctx.tenantId },
    });
    if (!supplier) throw notFound('Supplier', input.supplierId);
    if (supplier.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', 'Supplier is blocked');
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.warehouseId, tenantId: ctx.tenantId },
    });
    if (!warehouse) throw notFound('Warehouse', input.warehouseId);

    // Exactly-once conversion: guarded APPROVED -> CONVERTED flip.
    const flipped = await this.prisma.purchaseRequisition.updateMany({
      where: { id: requisition.id, tenantId: ctx.tenantId, status: 'APPROVED' },
      data: { status: 'CONVERTED' },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', 'Only approved requisitions convert to POs');
    }

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.purchaseOrder.count({ where: { tenantId: ctx.tenantId } });
      const po = await tx.purchaseOrder.create({
        data: {
          tenantId: ctx.tenantId,
          poNumber: `PO-${String(count + 1).padStart(6, '0')}`,
          supplierId: supplier.id,
          warehouseId: warehouse.id,
          requisitionId: requisition.id,
          currency: requisition.currency,
          total: requisition.total,
          expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
          createdBy: ctx.userId ?? null,
          lines: {
            create: requisition.lines.map((l) => ({
              tenantId: ctx.tenantId,
              skuId: l.skuId,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.estUnitPrice,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { lines: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'proc.po.create',
        objectType: 'PurchaseOrder',
        objectId: po.id,
        source: 'api',
        newValues: { poNumber: po.poNumber, requisitionId: requisition.id },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.PURCHASE_ORDER_ISSUED,
        aggregateType: 'PurchaseOrder',
        aggregateId: po.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { poId: po.id, poNumber: po.poNumber },
      });
      return poView(po);
    });
  }

  /**
   * Receives PO lines (PROC-009): posts an idempotent RECEIPT ledger
   * movement per line through WMS; a duplicate receipt key produces no
   * second stock effect and no double-counted received quantity.
   */
  async receivePo(
    input: {
      poId: string;
      receiptKey: string;
      lines: Array<{ lineId: string; quantity: number }>;
    },
    ctx: RequestContext,
  ): Promise<PurchaseOrderView> {
    if (input.receiptKey.length < 4 || input.receiptKey.length > 64) {
      throw new DomainError('VALIDATION_FAILED', 'receiptKey must be 4-64 chars');
    }
    if (input.lines.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Nothing to receive');
    }
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: input.poId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!po) throw notFound('PurchaseOrder', input.poId);
    if (po.status === 'CANCELLED' || po.status === 'RECEIVED') {
      throw new DomainError('INVALID_STATE', `A ${po.status} PO cannot receive goods`);
    }

    for (const item of input.lines) {
      if (!(item.quantity > 0)) {
        throw new DomainError('VALIDATION_FAILED', 'Received quantity must be positive');
      }
      const line = po.lines.find((l) => l.id === item.lineId);
      if (!line) throw notFound('PurchaseOrderLine', item.lineId);

      const { duplicate } = await this.receipts.postMovement(
        {
          warehouseId: po.warehouseId,
          skuId: line.skuId,
          movementType: 'RECEIPT',
          quantity: item.quantity,
          idempotencyKey: `po:${po.id}:line:${line.id}:${input.receiptKey}`,
          reason: `Receipt for ${po.poNumber}`,
        },
        ctx,
      );
      if (!duplicate) {
        await this.prisma.purchaseOrderLine.updateMany({
          where: { id: line.id, tenantId: ctx.tenantId },
          data: { receivedQty: { increment: item.quantity } },
        });
      }
    }

    const lines = await this.prisma.purchaseOrderLine.findMany({
      where: { poId: po.id, tenantId: ctx.tenantId },
    });
    const fullyReceived = lines.every((l) => Number(l.receivedQty) >= Number(l.quantity));
    await this.prisma.purchaseOrder.updateMany({
      where: { id: po.id, tenantId: ctx.tenantId, status: { in: ['OPEN', 'PARTIALLY_RECEIVED'] } },
      data: { status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
    });

    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'proc.po.receive',
        objectType: 'PurchaseOrder',
        objectId: po.id,
        source: 'api',
        newValues: { receiptKey: input.receiptKey, lines: input.lines.length },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.GOODS_RECEIPT_CREATED,
        aggregateType: 'PurchaseOrder',
        aggregateId: po.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { poId: po.id, receiptKey: input.receiptKey },
      });
    });
    return this.getPurchaseOrder(po.id, ctx);
  }

  async cancelPo(poId: string, ctx: RequestContext): Promise<PurchaseOrderView> {
    const flipped = await this.prisma.purchaseOrder.updateMany({
      where: { id: poId, tenantId: ctx.tenantId, status: 'OPEN' },
      data: { status: 'CANCELLED' },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', 'Only open POs (nothing received) can be cancelled');
    }
    return this.getPurchaseOrder(poId, ctx);
  }

  /** Purchase price history for a SKU, derived from PO lines (PROC-013). */
  async getPriceHistory(skuId: string, ctx: RequestContext): Promise<PriceHistoryEntry[]> {
    const lines = await this.prisma.purchaseOrderLine.findMany({
      where: { tenantId: ctx.tenantId, skuId },
      orderBy: [{ id: 'desc' }],
      take: 50,
    });
    const poIds = [...new Set(lines.map((l) => l.poId))];
    const pos = await this.prisma.purchaseOrder.findMany({
      where: { tenantId: ctx.tenantId, id: { in: poIds } },
    });
    const byId = new Map(pos.map((p) => [p.id, p]));
    return lines
      .map((l) => {
        const po = byId.get(l.poId);
        if (!po || po.status === 'CANCELLED') return null;
        return {
          poNumber: po.poNumber,
          supplierId: po.supplierId,
          unitPrice: l.unitPrice.toString(),
          currency: po.currency,
          orderedAt: po.createdAt.toISOString(),
        };
      })
      .filter((e): e is PriceHistoryEntry => e !== null)
      .sort((a, b) => (a.orderedAt < b.orderedAt ? 1 : -1));
  }

  private async recomputeRequisitionTotal(
    requisitionId: string,
    ctx: RequestContext,
  ): Promise<void> {
    const lines = await this.prisma.purchaseRequisitionLine.findMany({
      where: { tenantId: ctx.tenantId, requisitionId },
    });
    const total = Math.round(lines.reduce((sum, l) => sum + Number(l.lineTotal), 0) * 100) / 100;
    await this.prisma.purchaseRequisition.update({
      where: { id: requisitionId },
      data: { total },
    });
  }

  private async emitPurchaseEvent(
    eventType: (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES],
    requisitionId: string,
    ctx: RequestContext,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType,
        aggregateType: 'PurchaseRequisition',
        aggregateId: requisitionId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { requisitionId },
      });
    });
  }
  // ------------------------------------------------ supplier insights (029)

  /**
   * Supplier performance (PROC-012): per supplier — order count, spend
   * on received goods, fill rate and average days from order to first
   * receipt, all derived from POs and the receipt ledger.
   */
  async supplierPerformance(ctx: RequestContext): Promise<
    Array<{
      supplierId: string;
      supplierName: string;
      poCount: number;
      spend: string;
      fillRatePct: string;
      avgReceiptDays: string | null;
    }>
  > {
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId: ctx.tenantId },
    });
    const rows = [];
    for (const supplier of suppliers) {
      const party = await this.prisma.party.findFirst({
        where: { id: supplier.partyId, tenantId: ctx.tenantId },
      });
      const orders = await this.prisma.purchaseOrder.findMany({
        where: { tenantId: ctx.tenantId, supplierId: supplier.id, status: { not: 'CANCELLED' } },
        include: { lines: true },
      });
      let ordered = 0;
      let received = 0;
      let spend = 0;
      const receiptDays: number[] = [];
      for (const po of orders) {
        for (const line of po.lines) {
          ordered += Number(line.quantity);
          received += Number(line.receivedQty);
          spend += Number(line.receivedQty) * Number(line.unitPrice);
        }
        const firstReceipt = await this.prisma.stockMovement.findFirst({
          where: {
            tenantId: ctx.tenantId,
            idempotencyKey: { startsWith: `po:${po.id}:` },
          },
          orderBy: { occurredAt: 'asc' },
        });
        if (firstReceipt) {
          receiptDays.push(
            (firstReceipt.occurredAt.getTime() - po.createdAt.getTime()) / 86_400_000,
          );
        }
      }
      rows.push({
        supplierId: supplier.id,
        supplierName: party?.name ?? supplier.supplierNumber,
        poCount: orders.length,
        spend: spend.toFixed(2),
        fillRatePct: ordered > 0 ? ((received / ordered) * 100).toFixed(1) : '0.0',
        avgReceiptDays:
          receiptDays.length > 0
            ? (receiptDays.reduce((a, b) => a + b, 0) / receiptDays.length).toFixed(1)
            : null,
      });
    }
    return rows.sort((a, z) => Number(z.spend) - Number(a.spend));
  }

  /**
   * One-click purchase suggestion conversion (PROC-015): an MRP
   * PURCHASE suggestion becomes a draft requisition line, priced at the
   * SKU's last purchase price when one exists.
   */
  async requisitionFromSuggestion(
    suggestionId: string,
    ctx: RequestContext,
  ): Promise<RequisitionView> {
    const suggestion = await this.prisma.mrpSuggestion.findFirst({
      where: { id: suggestionId, tenantId: ctx.tenantId },
    });
    if (!suggestion) throw notFound('MrpSuggestion', suggestionId);
    if (suggestion.suggestionType !== 'PURCHASE') {
      throw new DomainError('VALIDATION_FAILED', 'Only purchase suggestions become requisitions');
    }
    const lastPriced = await this.prisma.purchaseOrderLine.findFirst({
      where: { tenantId: ctx.tenantId, skuId: suggestion.skuId },
      orderBy: { id: 'desc' },
    });
    const estUnitPrice = lastPriced ? Number(lastPriced.unitPrice) : 0;
    const requisition = await this.createRequisition({ currency: 'EUR' }, ctx);
    return this.addRequisitionLine(
      {
        requisitionId: requisition.id,
        skuId: suggestion.skuId,
        quantity: Number(suggestion.quantity),
        estUnitPrice,
      },
      ctx,
    );
  }
}

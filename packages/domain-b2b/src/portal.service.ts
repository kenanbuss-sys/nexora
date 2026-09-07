import { writeAudit } from '@nexora/audit';
import type { PortalUserStatus, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * B2B workspace — portal users bound to one CRM account (B2B-001/002).
 * Every self-service read resolves the caller's binding first and is
 * then scoped to that account: quotes (B2B-005), orders with their
 * timeline (B2B-006/010), invoices and open balance (B2B-011/012).
 *
 * Server-side scoping only: hidden UI is not authorization; a portal
 * user can never widen their account filter from the client.
 */

export interface PortalUserView {
  id: string;
  accountId: string;
  idpSubject: string;
  displayName: string;
  email: string | null;
  status: PortalUserStatus;
}

export interface PortalContext {
  accountId: string;
  accountNumber: string;
  accountName: string;
  displayName: string;
}

export interface PortalCredit {
  invoiced: string;
  paid: string;
  openBalance: string;
}

/** Cross-domain contract: support cases are owned by CRM (B2B-013). */
export interface PortalCaseGate {
  createCase(
    input: {
      subject: string;
      description?: string | undefined;
      accountId?: string | undefined;
      orderId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ id: string; caseNumber: string; status: string }>;
}

/** Cross-domain contract: order lifecycle is owned by OMS (COM-002). */
export interface PortalOrderGate {
  createOrder(
    input: { accountId: string; warehouseId: string; currency: string },
    ctx: RequestContext,
  ): Promise<{ id: string; orderNumber: string }>;
  addLine(
    input: { orderId: string; skuId: string; quantity: number; unitPrice: number },
    ctx: RequestContext,
  ): Promise<unknown>;
}

export class PortalService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly orders?: PortalOrderGate,
    private readonly cases?: PortalCaseGate,
  ) {}

  // ------------------------------------------------------------- management

  async listPortalUsers(ctx: RequestContext): Promise<PortalUserView[]> {
    const users = await this.prisma.portalUser.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    return users.map((u) => this.userView(u));
  }

  /** Binds an identity subject to one account (B2B-001). */
  async addPortalUser(
    input: {
      accountId: string;
      idpSubject: string;
      displayName: string;
      email?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<PortalUserView> {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: input.accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw notFound('CrmAccount', input.accountId);
    const existing = await this.prisma.portalUser.findFirst({
      where: { tenantId: ctx.tenantId, idpSubject: input.idpSubject },
    });
    if (existing) {
      throw new DomainError('CONFLICT', 'That identity is already a portal user');
    }
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.portalUser.create({
        data: {
          tenantId: ctx.tenantId,
          accountId: input.accountId,
          idpSubject: input.idpSubject,
          displayName: input.displayName,
          email: input.email ?? null,
          createdBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'b2b.portal_user.create',
        objectType: 'PortalUser',
        objectId: created.id,
        source: 'api',
        newValues: { accountId: input.accountId, idpSubject: input.idpSubject },
      });
      return created;
    });
    return this.userView(user);
  }

  async setPortalUserStatus(
    portalUserId: string,
    status: PortalUserStatus,
    ctx: RequestContext,
  ): Promise<void> {
    const updated = await this.prisma.portalUser.updateMany({
      where: { id: portalUserId, tenantId: ctx.tenantId },
      data: { status },
    });
    if (updated.count === 0) throw notFound('PortalUser', portalUserId);
  }

  // ----------------------------------------------------------- self-service

  /** Resolves the caller's account binding; everything else builds on it. */
  async resolvePortalContext(ctx: RequestContext): Promise<PortalContext> {
    if (!ctx.userId) {
      throw new DomainError('FORBIDDEN', 'Portal access needs a signed-in user');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
    });
    if (!user?.idpSubject) throw new DomainError('FORBIDDEN', 'Unknown user');
    const binding = await this.prisma.portalUser.findFirst({
      where: { tenantId: ctx.tenantId, idpSubject: user.idpSubject, status: 'ACTIVE' },
    });
    if (!binding) {
      throw new DomainError('FORBIDDEN', 'No active portal binding for this user');
    }
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: binding.accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw notFound('CrmAccount', binding.accountId);
    const party = await this.prisma.party.findFirst({
      where: { id: account.partyId, tenantId: ctx.tenantId },
    });
    return {
      accountId: account.id,
      accountNumber: account.accountNumber,
      accountName: party?.name ?? account.accountNumber,
      displayName: binding.displayName,
    };
  }

  /**
   * Entitled catalog (B2B-003/004): what THIS customer may buy, at
   * THEIR prices. With an active contract price list bound to the
   * account, the catalog is exactly its priced SKUs; without one, all
   * ACTIVE SKUs at general-list prices when resolvable (price null
   * otherwise).
   */
  async myCatalog(
    ctx: RequestContext,
  ): Promise<Array<{ skuId: string; code: string; name: string; unitPrice: string | null }>> {
    const portal = await this.resolvePortalContext(ctx);
    const now = new Date();
    const contract = await this.prisma.priceList.findFirst({
      where: {
        tenantId: ctx.tenantId,
        accountId: portal.accountId,
        status: 'ACTIVE',
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }],
      },
      include: { entries: true },
      orderBy: [{ createdAt: 'desc' }],
    });
    if (contract) {
      const skuIds = [...new Set(contract.entries.map((e) => e.skuId))];
      const skus = await this.prisma.sku.findMany({
        where: { tenantId: ctx.tenantId, id: { in: skuIds }, status: 'ACTIVE' },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      });
      const bestPrice = new Map<string, number>();
      for (const entry of contract.entries) {
        // Base price = the qty-1 break (lowest minQty).
        const current = bestPrice.get(entry.skuId);
        if (current === undefined || Number(entry.minQty) < current) {
          bestPrice.set(entry.skuId, Number(entry.minQty));
        }
      }
      const priceFor = new Map<string, string>();
      for (const entry of contract.entries) {
        if (Number(entry.minQty) === bestPrice.get(entry.skuId)) {
          priceFor.set(entry.skuId, entry.unitPrice.toString());
        }
      }
      return skus.map((sku) => ({
        skuId: sku.id,
        code: sku.code,
        name: sku.name,
        unitPrice: priceFor.get(sku.id) ?? null,
      }));
    }
    const skus = await this.prisma.sku.findMany({
      where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
      take: 200,
    });
    return skus.map((sku) => ({ skuId: sku.id, code: sku.code, name: sku.name, unitPrice: null }));
  }

  /**
   * Self-service ordering (COM-002): a portal user places an order for
   * their own account only, priced from their contract catalog; lines
   * without a contract price are refused so the portal can never
   * invent prices. The order lands as DRAFT for the seller's OMS flow.
   */
  async placeOrder(
    input: {
      warehouseId?: string | undefined;
      currency?: string | undefined;
      lines: Array<{ skuId: string; quantity: number }>;
    },
    ctx: RequestContext,
  ): Promise<{ id: string; orderNumber: string; lines: number }> {
    if (!this.orders) {
      throw new DomainError('INVALID_STATE', 'Portal ordering is not configured');
    }
    if (input.lines.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'An order needs at least one line');
    }
    const portal = await this.resolvePortalContext(ctx);
    const catalog = await this.myCatalog(ctx);
    const priced = new Map(
      catalog.filter((c) => c.unitPrice !== null).map((c) => [c.skuId, Number(c.unitPrice)]),
    );
    for (const line of input.lines) {
      if (!priced.has(line.skuId)) {
        throw new DomainError(
          'INVALID_STATE',
          'A line is not in your contract catalog — ask your account manager for a price',
        );
      }
      if (!(line.quantity > 0)) {
        throw new DomainError('VALIDATION_FAILED', 'Quantities must be positive');
      }
    }
    let warehouseId = input.warehouseId;
    if (!warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { tenantId: ctx.tenantId },
        orderBy: [{ code: 'asc' }],
        select: { id: true },
      });
      if (!warehouse) throw new DomainError('INVALID_STATE', 'No warehouse is configured');
      warehouseId = warehouse.id;
    }
    const order = await this.orders.createOrder(
      { accountId: portal.accountId, warehouseId, currency: input.currency ?? 'EUR' },
      ctx,
    );
    for (const line of input.lines) {
      await this.orders.addLine(
        {
          orderId: order.id,
          skuId: line.skuId,
          quantity: line.quantity,
          unitPrice: priced.get(line.skuId) ?? 0,
        },
        ctx,
      );
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'b2b.portal.order',
      objectType: 'SalesOrder',
      objectId: order.id,
      source: 'api',
      newValues: { accountId: portal.accountId, lines: input.lines.length },
    });
    return { id: order.id, orderNumber: order.orderNumber, lines: input.lines.length };
  }

  /**
   * Claims/service (B2B-013): a portal user files a claim about their
   * own order; it lands as a CRM support case bound to the account and
   * order, so service works one queue. Listing shows only own claims.
   */
  async fileClaim(
    input: { orderId: string; subject: string; description?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ id: string; caseNumber: string; status: string }> {
    if (!this.cases) {
      throw new DomainError('INVALID_STATE', 'Claims are not configured');
    }
    if (!input.subject.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'A claim needs a subject');
    }
    const portal = await this.resolvePortalContext(ctx);
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: input.orderId, tenantId: ctx.tenantId, accountId: portal.accountId },
      select: { id: true },
    });
    if (!order) throw notFound('SalesOrder', input.orderId);
    const created = await this.cases.createCase(
      {
        subject: input.subject,
        ...(input.description !== undefined ? { description: input.description } : {}),
        accountId: portal.accountId,
        orderId: order.id,
      },
      ctx,
    );
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'b2b.portal.claim',
      objectType: 'SupportCase',
      objectId: created.id,
      source: 'api',
      newValues: { orderId: order.id, accountId: portal.accountId },
    });
    return created;
  }

  async myClaims(ctx: RequestContext) {
    const portal = await this.resolvePortalContext(ctx);
    const rows = await this.prisma.supportCase.findMany({
      where: { tenantId: ctx.tenantId, accountId: portal.accountId },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      caseNumber: r.caseNumber,
      subject: r.subject,
      status: r.status,
      orderId: r.orderId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Own orders with lines (B2B-006). */
  async myOrders(ctx: RequestContext) {
    const portal = await this.resolvePortalContext(ctx);
    const orders = await this.prisma.salesOrder.findMany({
      where: { tenantId: ctx.tenantId, accountId: portal.accountId },
      include: { lines: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });
    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      currency: o.currency,
      total: o.total.toString(),
      createdAt: o.createdAt.toISOString(),
      lines: o.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity.toString(),
        lineTotal: l.lineTotal.toString(),
      })),
    }));
  }

  /** Production/status milestones for one own order (B2B-010). */
  async myOrderTimeline(orderId: string, ctx: RequestContext) {
    const portal = await this.resolvePortalContext(ctx);
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId, accountId: portal.accountId },
    });
    if (!order) throw notFound('SalesOrder', orderId);
    const events = await this.prisma.orderEvent.findMany({
      where: { tenantId: ctx.tenantId, orderId: order.id },
      orderBy: [{ createdAt: 'asc' }],
      take: 100,
    });
    return events.map((e) => ({
      eventType: e.eventType,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  /** Own quotes (B2B-005). */
  async myQuotes(ctx: RequestContext) {
    const portal = await this.resolvePortalContext(ctx);
    const quotes = await this.prisma.quote.findMany({
      where: { tenantId: ctx.tenantId, accountId: portal.accountId },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });
    return quotes.map((q) => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      version: q.version,
      status: q.status,
      currency: q.currency,
      total: q.total.toString(),
    }));
  }

  /** Own invoices with balance (B2B-011/012). */
  async myInvoices(ctx: RequestContext) {
    const portal = await this.resolvePortalContext(ctx);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId: ctx.tenantId,
        invoiceType: 'CUSTOMER',
        partyRefId: portal.accountId,
        status: { not: 'VOID' },
      },
      orderBy: [{ issuedAt: 'desc' }],
      take: 50,
    });
    return invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      currency: i.currency,
      total: i.total.toString(),
      paidAmount: i.paidAmount.toString(),
      status: i.status,
      issuedAt: i.issuedAt.toISOString(),
      dueAt: i.dueAt ? i.dueAt.toISOString() : null,
    }));
  }

  /** Credit visibility (B2B-012). */
  async myCredit(ctx: RequestContext): Promise<PortalCredit> {
    const portal = await this.resolvePortalContext(ctx);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId: ctx.tenantId,
        invoiceType: 'CUSTOMER',
        partyRefId: portal.accountId,
        status: { not: 'VOID' },
      },
    });
    let invoiced = 0;
    let paid = 0;
    for (const invoice of invoices) {
      invoiced += Number(invoice.total);
      paid += Number(invoice.paidAmount);
    }
    const money = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
    return {
      invoiced: money(invoiced),
      paid: money(paid),
      openBalance: money(invoiced - paid),
    };
  }

  private userView(user: {
    id: string;
    accountId: string;
    idpSubject: string;
    displayName: string;
    email: string | null;
    status: PortalUserStatus;
  }): PortalUserView {
    return {
      id: user.id,
      accountId: user.accountId,
      idpSubject: user.idpSubject,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
    };
  }
}

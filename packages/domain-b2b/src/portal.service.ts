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

export class PortalService {
  constructor(private readonly prisma: PrismaClient) {}

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

import type { PrismaClient } from '@nexora/db';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Role home (Sprint 249): "my work today" read model for the made-to-order
 * flow — one call, sections included only for the permissions the caller
 * holds (sales, production, installation, accounting, management). Read
 * only; every number links to the screen where the work is done.
 */

export interface RoleHome {
  generatedAt: string;
  sales?: {
    draftQuotes: number;
    sentQuotes: number;
    ordersToConfirm: number;
    confirmedWithoutAdvance: number;
    measurementsNext7Days: number;
  };
  production?: {
    planned: number;
    released: number;
    inProgress: number;
    completedThisWeek: number;
    ordersWaitingForWorkOrders: number;
  };
  installation?: {
    next7Days: Array<{
      id: string;
      orderNumber: string;
      kind: string;
      status: string;
      slotStart: string | null;
      slotEnd: string | null;
      siteAddress: string | null;
    }>;
    unscheduled: number;
  };
  accounting?: {
    fulfilledNotInvoiced: number;
    openInvoices: number;
    openAmount: string;
    overdueInvoices: number;
    kifThisMonth: number;
  };
  management?: {
    revenueThisMonth: string;
    openOrdersValue: string;
    quotesWonLast30: number;
    quotesLostLast30: number;
    installationsDoneThisWeek: number;
  };
}

function weekBounds(now: Date): { start: Date } {
  const day = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1)),
  );
  return { start };
}

export class RoleHomeService {
  constructor(private readonly prisma: PrismaClient) {}

  async home(ctx: RequestContext, permissions: Set<string>): Promise<RoleHome> {
    const t = ctx.tenantId;
    const now = new Date();
    const { start: weekStart } = weekBounds(now);
    // Field work looks ahead: today plus the next six days (a Sunday view
    // shows the coming week, not the one that is ending).
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const aheadEnd = new Date(todayStart.getTime() + 7 * 86_400_000);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const has = (p: string) => ctx.platformAdmin === true || permissions.has(p);
    const result: RoleHome = { generatedAt: now.toISOString() };

    if (has('quote.read') || has('order.read')) {
      const [draftQuotes, sentQuotes, ordersToConfirm, confirmed, advances, measurements] =
        await Promise.all([
          this.prisma.quote.count({ where: { tenantId: t, status: 'DRAFT' } }),
          this.prisma.quote.count({ where: { tenantId: t, status: 'SENT' } }),
          this.prisma.salesOrder.count({ where: { tenantId: t, status: 'DRAFT' } }),
          this.prisma.salesOrder.findMany({
            where: { tenantId: t, status: 'CONFIRMED' },
            select: { id: true },
            take: 2000,
          }),
          this.prisma.invoice.findMany({
            where: { tenantId: t, invoiceType: 'CUSTOMER', invoiceKind: 'ADVANCE' },
            select: { orderRefId: true },
            take: 5000,
          }),
          this.prisma.serviceOrder.count({
            where: {
              tenantId: t,
              kind: 'MEASUREMENT',
              slotStart: { gte: todayStart, lt: aheadEnd },
              status: { not: 'CANCELLED' },
            },
          }),
        ]);
      const withAdvance = new Set(advances.map((a) => a.orderRefId));
      result.sales = {
        draftQuotes,
        sentQuotes,
        ordersToConfirm,
        confirmedWithoutAdvance: confirmed.filter((o) => !withAdvance.has(o.id)).length,
        measurementsNext7Days: measurements,
      };
    }

    if (has('production.read')) {
      const [planned, released, inProgress, completedThisWeek, confirmed, linked] =
        await Promise.all([
          this.prisma.workOrder.count({ where: { tenantId: t, status: 'PLANNED' } }),
          this.prisma.workOrder.count({ where: { tenantId: t, status: 'RELEASED' } }),
          this.prisma.workOrder.count({ where: { tenantId: t, status: 'IN_PROGRESS' } }),
          this.prisma.workOrder.count({
            where: { tenantId: t, status: 'COMPLETED', completedAt: { gte: weekStart } },
          }),
          this.prisma.salesOrder.findMany({
            where: { tenantId: t, status: 'CONFIRMED' },
            select: { id: true },
            take: 2000,
          }),
          this.prisma.workOrder.findMany({
            where: { tenantId: t, salesOrderId: { not: null } },
            select: { salesOrderId: true },
            distinct: ['salesOrderId'],
            take: 5000,
          }),
        ]);
      const withWo = new Set(linked.map((w) => w.salesOrderId));
      result.production = {
        planned,
        released,
        inProgress,
        completedThisWeek,
        ordersWaitingForWorkOrders: confirmed.filter((o) => !withWo.has(o.id)).length,
      };
    }

    if (has('service.read')) {
      const [next7Days, unscheduled] = await Promise.all([
        this.prisma.serviceOrder.findMany({
          where: {
            tenantId: t,
            slotStart: { gte: todayStart, lt: aheadEnd },
            status: { not: 'CANCELLED' },
          },
          orderBy: { slotStart: 'asc' },
          take: 100,
          select: {
            id: true,
            orderNumber: true,
            kind: true,
            status: true,
            slotStart: true,
            slotEnd: true,
            siteAddress: true,
          },
        }),
        this.prisma.serviceOrder.count({
          where: { tenantId: t, kind: 'INSTALLATION', status: 'PLANNED' },
        }),
      ]);
      result.installation = {
        next7Days: next7Days.map((v) => ({
          ...v,
          slotStart: v.slotStart?.toISOString() ?? null,
          slotEnd: v.slotEnd?.toISOString() ?? null,
        })),
        unscheduled,
      };
    }

    if (has('finance.read')) {
      const [fulfilled, invoiced, open, overdue, kif] = await Promise.all([
        this.prisma.salesOrder.findMany({
          where: { tenantId: t, status: 'FULFILLED' },
          select: { id: true },
          take: 5000,
        }),
        this.prisma.invoice.findMany({
          where: { tenantId: t, invoiceType: 'CUSTOMER', invoiceKind: 'STANDARD' },
          select: { orderRefId: true },
          take: 10000,
        }),
        this.prisma.invoice.aggregate({
          where: {
            tenantId: t,
            invoiceType: 'CUSTOMER',
            status: { in: ['OPEN', 'PARTIALLY_PAID'] },
          },
          _count: true,
          _sum: { total: true, paidAmount: true },
        }),
        this.prisma.invoice.count({
          where: {
            tenantId: t,
            invoiceType: 'CUSTOMER',
            status: { in: ['OPEN', 'PARTIALLY_PAID'] },
            dueAt: { lt: now },
          },
        }),
        this.prisma.vatBookEntry.count({
          where: { tenantId: t, bookType: 'KIF', createdAt: { gte: monthStart } },
        }),
      ]);
      const invoicedOrders = new Set(invoiced.map((i) => i.orderRefId));
      const openAmount = Number(open._sum.total ?? 0) - Number(open._sum.paidAmount ?? 0);
      result.accounting = {
        fulfilledNotInvoiced: fulfilled.filter((o) => !invoicedOrders.has(o.id)).length,
        openInvoices: open._count,
        openAmount: openAmount.toFixed(2),
        overdueInvoices: overdue,
        kifThisMonth: kif,
      };
    }

    if (has('analytics.read')) {
      const since30 = new Date(now.getTime() - 30 * 86_400_000);
      const [revenue, openOrders, won, lost, installed] = await Promise.all([
        this.prisma.invoice.aggregate({
          where: { tenantId: t, invoiceType: 'CUSTOMER', issuedAt: { gte: monthStart } },
          _sum: { total: true },
        }),
        this.prisma.salesOrder.aggregate({
          where: { tenantId: t, status: { in: ['CONFIRMED', 'ON_HOLD'] } },
          _sum: { total: true },
        }),
        this.prisma.quote.count({
          where: { tenantId: t, status: 'ACCEPTED', updatedAt: { gte: since30 } },
        }),
        this.prisma.quote.count({
          where: {
            tenantId: t,
            status: { in: ['REJECTED', 'EXPIRED'] },
            updatedAt: { gte: since30 },
          },
        }),
        this.prisma.serviceOrder.count({
          where: {
            tenantId: t,
            kind: 'INSTALLATION',
            status: 'DONE',
            updatedAt: { gte: weekStart },
          },
        }),
      ]);
      result.management = {
        revenueThisMonth: Number(revenue._sum.total ?? 0).toFixed(2),
        openOrdersValue: Number(openOrders._sum.total ?? 0).toFixed(2),
        quotesWonLast30: won,
        quotesLostLast30: lost,
        installationsDoneThisWeek: installed,
      };
    }
    return result;
  }
}

import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Customer 360 (CRM-005), governed credit profile (CRM-008) and
 * segmentation tags (CRM-009).
 *
 * The 360 view is a read model: it aggregates the account's commercial
 * life — revenue, receivables, orders, quotes, opportunities and the
 * activity trail — in one tenant-scoped query fan-out. Credit is
 * enforceable: OMS confirms orders through checkCredit, so a credit
 * hold or an exceeded limit blocks new commitments server-side.
 */

export interface CreditProfile {
  creditLimit: string | null;
  creditHold: boolean;
  paymentTermsDays: number | null;
  invoiced: string;
  paid: string;
  openBalance: string;
  availableCredit: string | null;
}

export interface Customer360View {
  accountId: string;
  accountNumber: string;
  partyName: string;
  status: string;
  tags: string[];
  credit: CreditProfile;
  orders: {
    count: number;
    revenue: string;
    recent: Array<{ id: string; orderNumber: string; status: string; total: string }>;
  };
  quotes: { open: number };
  opportunities: { open: number; won: number };
  activities: Array<{ id: string; activityType: string; subject: string; occurredAt: string }>;
}

const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,29}$/u;

export class Customer360Service {
  constructor(private readonly prisma: PrismaClient) {}

  private async openBalance(
    tenantId: string,
    accountId: string,
  ): Promise<{ invoiced: number; paid: number; open: number }> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, invoiceType: 'CUSTOMER', partyRefId: accountId, status: { not: 'VOID' } },
    });
    const invoiced = invoices.reduce((s, i) => s + Number(i.total), 0);
    const paid = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
    return { invoiced, paid, open: invoiced - paid };
  }

  async customer360(accountId: string, ctx: RequestContext): Promise<Customer360View> {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw notFound('CrmAccount', accountId);
    const party = await this.prisma.party.findFirst({
      where: { id: account.partyId, tenantId: ctx.tenantId },
    });

    const [orders, recentOrders, openQuotes, opportunities, activities, balance] =
      await Promise.all([
        this.prisma.salesOrder.findMany({
          where: { tenantId: ctx.tenantId, accountId, status: { not: 'CANCELLED' } },
          select: { total: true },
        }),
        this.prisma.salesOrder.findMany({
          where: { tenantId: ctx.tenantId, accountId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.quote.count({
          where: { tenantId: ctx.tenantId, accountId, status: { in: ['DRAFT', 'SENT'] } },
        }),
        this.prisma.opportunity.findMany({
          where: { tenantId: ctx.tenantId, accountId },
          select: { stage: true },
        }),
        this.prisma.crmActivity.findMany({
          where: { tenantId: ctx.tenantId, accountId },
          orderBy: { occurredAt: 'desc' },
          take: 5,
        }),
        this.openBalance(ctx.tenantId, accountId),
      ]);

    const limit = account.creditLimit === null ? null : Number(account.creditLimit);
    return {
      accountId: account.id,
      accountNumber: account.accountNumber,
      partyName: party?.name ?? '(unknown party)',
      status: account.status,
      tags: account.tags,
      credit: {
        creditLimit: limit === null ? null : limit.toFixed(2),
        creditHold: account.creditHold,
        paymentTermsDays: account.paymentTermsDays,
        invoiced: balance.invoiced.toFixed(2),
        paid: balance.paid.toFixed(2),
        openBalance: balance.open.toFixed(2),
        availableCredit: limit === null ? null : (limit - balance.open).toFixed(2),
      },
      orders: {
        count: orders.length,
        revenue: orders.reduce((s, o) => s + Number(o.total), 0).toFixed(2),
        recent: recentOrders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          total: Number(o.total).toFixed(2),
        })),
      },
      quotes: { open: openQuotes },
      opportunities: {
        open: opportunities.filter((o) => o.stage !== 'WON' && o.stage !== 'LOST').length,
        won: opportunities.filter((o) => o.stage === 'WON').length,
      },
      activities: activities.map((a) => ({
        id: a.id,
        activityType: a.activityType,
        subject: a.subject,
        occurredAt: a.occurredAt.toISOString(),
      })),
    };
  }

  /** Governed credit profile (CRM-008): audited, server-enforced. */
  async setCreditProfile(
    accountId: string,
    input: {
      creditLimit?: number | null | undefined;
      creditHold?: boolean | undefined;
      paymentTermsDays?: number | null | undefined;
    },
    ctx: RequestContext,
  ): Promise<void> {
    if (input.creditLimit !== undefined && input.creditLimit !== null && input.creditLimit < 0) {
      throw new DomainError('VALIDATION_FAILED', 'Credit limit cannot be negative');
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.crmAccount.updateMany({
        where: { id: accountId, tenantId: ctx.tenantId },
        data: {
          ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
          ...(input.creditHold !== undefined ? { creditHold: input.creditHold } : {}),
          ...(input.paymentTermsDays !== undefined
            ? { paymentTermsDays: input.paymentTermsDays }
            : {}),
        },
      });
      if (updated.count === 0) throw notFound('CrmAccount', accountId);
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'crm.credit.update',
        objectType: 'CrmAccount',
        objectId: accountId,
        source: 'api',
        newValues: {
          creditLimit: input.creditLimit,
          creditHold: input.creditHold,
          paymentTermsDays: input.paymentTermsDays,
        },
      });
    });
  }

  /** Segmentation tags (CRM-009). */
  async setTags(accountId: string, tags: string[], ctx: RequestContext): Promise<void> {
    const clean = [...new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))];
    if (clean.length > 12) {
      throw new DomainError('VALIDATION_FAILED', 'At most 12 tags per account');
    }
    for (const tag of clean) {
      if (!TAG_PATTERN.test(tag)) {
        throw new DomainError('VALIDATION_FAILED', `Invalid tag '${tag}'`);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.crmAccount.updateMany({
        where: { id: accountId, tenantId: ctx.tenantId },
        data: { tags: clean },
      });
      if (updated.count === 0) throw notFound('CrmAccount', accountId);
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'crm.tags.update',
        objectType: 'CrmAccount',
        objectId: accountId,
        source: 'api',
        newValues: { tags: clean },
      });
    });
  }

  /**
   * Cross-domain credit gate used by OMS on order confirmation: a hold
   * always blocks; a set limit blocks when open receivables plus the
   * new commitment would exceed it.
   */
  async checkCredit(
    tenantId: string,
    accountId: string,
    additionalAmount: number,
  ): Promise<{ allowed: boolean; reason: string | null }> {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId },
    });
    if (!account) return { allowed: false, reason: 'Unknown account' };
    if (account.creditHold) {
      return { allowed: false, reason: 'Account is on credit hold' };
    }
    if (account.creditLimit !== null) {
      const { open } = await this.openBalance(tenantId, accountId);
      const limit = Number(account.creditLimit);
      if (open + additionalAmount > limit + 1e-9) {
        return {
          allowed: false,
          reason: `Credit limit exceeded (open ${open.toFixed(2)} + order ${additionalAmount.toFixed(2)} > limit ${limit.toFixed(2)})`,
        };
      }
    }
    return { allowed: true, reason: null };
  }
}

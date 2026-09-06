import { writeAudit } from '@nexora/audit';
import type { PrismaClient, SupportCasePriority, SupportCaseStatus } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Customer support cases (CSM-001/003/011). Numbered cases with an
 * explicit lifecycle, optional CRM account and sales order linkage,
 * assignment, and audited transitions:
 *
 *   OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED
 *              ^               |
 *              +--- reopen ----+
 */

export interface SupportCaseView {
  id: string;
  caseNumber: string;
  subject: string;
  description: string | null;
  status: SupportCaseStatus;
  priority: SupportCasePriority;
  accountId: string | null;
  orderId: string | null;
  assignedTo: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const TRANSITIONS: Record<SupportCaseStatus, SupportCaseStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED', 'OPEN'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

export class SupportCaseService {
  constructor(private readonly prisma: PrismaClient) {}

  private toView(c: {
    id: string;
    caseNumber: string;
    subject: string;
    description: string | null;
    status: SupportCaseStatus;
    priority: SupportCasePriority;
    accountId: string | null;
    orderId: string | null;
    assignedTo: string | null;
    resolvedAt: Date | null;
    createdAt: Date;
  }): SupportCaseView {
    return {
      id: c.id,
      caseNumber: c.caseNumber,
      subject: c.subject,
      description: c.description,
      status: c.status,
      priority: c.priority,
      accountId: c.accountId,
      orderId: c.orderId,
      assignedTo: c.assignedTo,
      resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  async listCases(
    filter: { status?: SupportCaseStatus | undefined },
    ctx: RequestContext,
  ): Promise<SupportCaseView[]> {
    const rows = await this.prisma.supportCase.findMany({
      where: { tenantId: ctx.tenantId, ...(filter.status ? { status: filter.status } : {}) },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return rows.map((r) => this.toView(r));
  }

  async createCase(
    input: {
      subject: string;
      description?: string | undefined;
      priority?: SupportCasePriority | undefined;
      accountId?: string | undefined;
      orderId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<SupportCaseView> {
    if (!input.subject?.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'Subject is required');
    }
    if (input.accountId) {
      const account = await this.prisma.crmAccount.findFirst({
        where: { id: input.accountId, tenantId: ctx.tenantId },
      });
      if (!account) throw notFound('CrmAccount', input.accountId);
    }
    if (input.orderId) {
      const order = await this.prisma.salesOrder.findFirst({
        where: { id: input.orderId, tenantId: ctx.tenantId },
      });
      if (!order) throw notFound('SalesOrder', input.orderId);
    }
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.supportCase.count({ where: { tenantId: ctx.tenantId } });
      const created = await tx.supportCase.create({
        data: {
          tenantId: ctx.tenantId,
          caseNumber: `CS-${String(count + 1).padStart(6, '0')}`,
          subject: input.subject.trim(),
          description: input.description?.trim() || null,
          priority: input.priority ?? 'NORMAL',
          accountId: input.accountId ?? null,
          orderId: input.orderId ?? null,
          createdBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'csm.case.create',
        objectType: 'SupportCase',
        objectId: created.id,
        source: 'api',
        newValues: { caseNumber: created.caseNumber, subject: created.subject },
      });
      return this.toView(created);
    });
  }

  async assignCase(caseId: string, userId: string | null, ctx: RequestContext) {
    const row = await this.prisma.supportCase.findFirst({
      where: { id: caseId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('SupportCase', caseId);
    if (row.status === 'CLOSED') {
      throw new DomainError('INVALID_STATE', 'Closed cases cannot be reassigned');
    }
    if (userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: userId, tenantId: ctx.tenantId, status: 'ACTIVE' },
      });
      if (!user) throw notFound('User', userId);
    }
    const updated = await this.prisma.supportCase.update({
      where: { id: row.id },
      data: { assignedTo: userId },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'csm.case.assign',
      objectType: 'SupportCase',
      objectId: row.id,
      source: 'api',
      previousValues: { assignedTo: row.assignedTo },
      newValues: { assignedTo: userId },
    });
    return this.toView(updated);
  }

  async transition(
    caseId: string,
    status: SupportCaseStatus,
    ctx: RequestContext,
  ): Promise<SupportCaseView> {
    const row = await this.prisma.supportCase.findFirst({
      where: { id: caseId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('SupportCase', caseId);
    if (!TRANSITIONS[row.status].includes(status)) {
      throw new DomainError('INVALID_STATE', `A case cannot go from ${row.status} to ${status}`);
    }
    const updated = await this.prisma.supportCase.update({
      where: { id: row.id },
      data: {
        status,
        resolvedAt:
          status === 'RESOLVED' ? new Date() : status === 'IN_PROGRESS' ? null : row.resolvedAt,
      },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'csm.case.transition',
      objectType: 'SupportCase',
      objectId: row.id,
      source: 'api',
      previousValues: { status: row.status },
      newValues: { status },
    });
    return this.toView(updated);
  }
}

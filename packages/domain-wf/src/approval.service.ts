import { writeAudit } from '@nexora/audit';
import type { Db, PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * WF — approval primitive.
 * Segregation of duties: the requester can never decide their own approval
 * (docs/security/04_PERMISSION_MODEL.md; IAM-011 foundation).
 */

export interface ApprovalView {
  id: string;
  title: string;
  status: 'REQUESTED' | 'GRANTED' | 'REJECTED';
  subjectObjectType: string;
  subjectObjectId: string;
  requestedByUserId: string | null;
  decidedByUserId: string | null;
  reason: string | null;
}

function toView(a: {
  id: string;
  title: string;
  status: 'REQUESTED' | 'GRANTED' | 'REJECTED';
  subjectObjectType: string;
  subjectObjectId: string;
  requestedByUserId: string | null;
  decidedByUserId: string | null;
  reason: string | null;
}): ApprovalView {
  return {
    id: a.id,
    title: a.title,
    status: a.status,
    subjectObjectType: a.subjectObjectType,
    subjectObjectId: a.subjectObjectId,
    requestedByUserId: a.requestedByUserId,
    decidedByUserId: a.decidedByUserId,
    reason: a.reason,
  };
}

export class ApprovalService {
  constructor(private readonly prisma: PrismaClient) {}

  async requestApproval(
    input: { title: string; subjectObjectType: string; subjectObjectId: string },
    ctx: RequestContext,
  ): Promise<ApprovalView> {
    return this.prisma.$transaction(async (tx) =>
      this.requestApprovalInTx(tx, input, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        requestedByUserId: ctx.userId,
        source: 'api',
      }),
    );
  }

  /**
   * Transactional variant for automation (rule engine) — runs inside the
   * caller's transaction so a duplicate event cannot half-apply.
   */
  async requestApprovalInTx(
    tx: Db,
    input: { title: string; subjectObjectType: string; subjectObjectId: string },
    actor: {
      tenantId: string;
      actorType: 'USER' | 'SERVICE' | 'SYSTEM';
      actorId?: string | undefined;
      requestedByUserId?: string | undefined;
      source: string;
    },
  ): Promise<ApprovalView> {
    const approval = await tx.approval.create({
      data: {
        tenantId: actor.tenantId,
        title: input.title,
        subjectObjectType: input.subjectObjectType,
        subjectObjectId: input.subjectObjectId,
        requestedByUserId: actor.requestedByUserId ?? null,
      },
    });
    await writeAudit(tx, {
      tenantId: actor.tenantId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: 'approval.request',
      objectType: 'Approval',
      objectId: approval.id,
      source: actor.source,
      newValues: {
        title: input.title,
        subject: `${input.subjectObjectType}:${input.subjectObjectId}`,
      },
    });
    await publishToOutbox(tx, {
      tenantId: actor.tenantId,
      eventType: EVENT_TYPES.APPROVAL_REQUESTED,
      aggregateType: 'Approval',
      aggregateId: approval.id,
      actorType: actor.actorType,
      actorId: actor.actorId,
      payload: { approvalId: approval.id },
    });
    return toView(approval);
  }

  async decide(
    approvalId: string,
    decision: 'GRANTED' | 'REJECTED',
    reason: string | undefined,
    ctx: RequestContext,
  ): Promise<ApprovalView> {
    if (!ctx.userId) throw new DomainError('FORBIDDEN', 'No linked user in tenant');
    return this.prisma.$transaction(async (tx) => {
      const approval = await tx.approval.findFirst({
        where: { id: approvalId, tenantId: ctx.tenantId },
      });
      if (!approval) throw notFound('Approval', approvalId);
      if (approval.status !== 'REQUESTED') {
        throw new DomainError('INVALID_STATE', `Approval is already ${approval.status}`);
      }
      if (approval.requestedByUserId && approval.requestedByUserId === ctx.userId) {
        throw new DomainError(
          'FORBIDDEN',
          'Segregation of duties: you cannot decide your own approval request',
        );
      }
      // Guarded flip: a concurrent decision cannot double-apply.
      const updated = await tx.approval.updateMany({
        where: { id: approval.id, status: 'REQUESTED' },
        data: {
          status: decision,
          decidedByUserId: ctx.userId ?? null,
          reason: reason ?? null,
          decidedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new DomainError('CONFLICT', 'Approval was decided concurrently');
      }
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: decision === 'GRANTED' ? 'approval.grant' : 'approval.reject',
        objectType: 'Approval',
        objectId: approval.id,
        source: 'api',
        previousValues: { status: 'REQUESTED' },
        newValues: { status: decision },
        reason,
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType:
          decision === 'GRANTED' ? EVENT_TYPES.APPROVAL_GRANTED : EVENT_TYPES.APPROVAL_REJECTED,
        aggregateType: 'Approval',
        aggregateId: approval.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { approvalId: approval.id },
      });
      const fresh = await tx.approval.findUniqueOrThrow({ where: { id: approval.id } });
      return toView(fresh);
    });
  }

  /** Approvals awaiting a decision, excluding the caller's own requests (SoD). */
  async pendingForUser(ctx: RequestContext): Promise<ApprovalView[]> {
    if (!ctx.userId) return [];
    const approvals = await this.prisma.approval.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'REQUESTED',
        NOT: { requestedByUserId: ctx.userId },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return approvals.map(toView);
  }
}

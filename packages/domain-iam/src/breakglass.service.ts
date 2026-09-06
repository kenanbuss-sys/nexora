import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Break-glass access (IAM-014). A time-boxed emergency elevation that
 * bypasses role permissions. Guardrails: never self-service (a second
 * admin grants it), a mandatory reason, a hard cap on duration, early
 * revocation, and loud auditing — the grant, every use, and the
 * revocation all land in the audit ledger and security event log.
 */

export interface BreakGlassView {
  id: string;
  userId: string;
  userEmail: string;
  reason: string;
  grantedBy: string;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
}

export const BREAK_GLASS_MAX_MINUTES = 240;

export class BreakGlassService {
  constructor(private readonly prisma: PrismaClient) {}

  private view(
    row: {
      id: string;
      userId: string;
      reason: string;
      grantedBy: string;
      expiresAt: Date;
      revokedAt: Date | null;
    },
    email: string,
  ): BreakGlassView {
    const active = row.revokedAt === null && row.expiresAt > new Date();
    return {
      id: row.id,
      userId: row.userId,
      userEmail: email,
      reason: row.reason,
      grantedBy: row.grantedBy,
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      active,
    };
  }

  async listGrants(ctx: RequestContext): Promise<BreakGlassView[]> {
    const rows = await this.prisma.breakGlassGrant.findMany({
      where: { tenantId: ctx.tenantId },
      include: { user: { select: { email: true } } },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return rows.map((r) => this.view(r, r.user.email));
  }

  async grant(
    input: { userId: string; reason: string; minutes: number },
    ctx: RequestContext,
  ): Promise<BreakGlassView> {
    if (!input.reason?.trim() || input.reason.trim().length < 10) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'A break-glass grant demands a substantive reason (at least 10 characters)',
      );
    }
    if (
      !Number.isInteger(input.minutes) ||
      input.minutes < 5 ||
      input.minutes > BREAK_GLASS_MAX_MINUTES
    ) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Duration must be between 5 and ${BREAK_GLASS_MAX_MINUTES} minutes`,
      );
    }
    if (ctx.userId && ctx.userId === input.userId) {
      throw new DomainError('FORBIDDEN', 'Break-glass access cannot be granted to yourself');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: input.userId, tenantId: ctx.tenantId },
    });
    if (!user) throw notFound('User', input.userId);
    if (user.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', 'Break-glass access requires an active user');
    }
    const existing = await this.prisma.breakGlassGrant.findFirst({
      where: {
        tenantId: ctx.tenantId,
        userId: input.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (existing) {
      throw new DomainError('CONFLICT', 'An active break-glass grant already exists for this user');
    }
    const expiresAt = new Date(Date.now() + input.minutes * 60_000);
    const created = await this.prisma.breakGlassGrant.create({
      data: {
        tenantId: ctx.tenantId,
        userId: input.userId,
        reason: input.reason.trim(),
        grantedBy: ctx.userId ?? input.userId,
        expiresAt,
      },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'iam.break_glass.grant',
      objectType: 'User',
      objectId: input.userId,
      source: 'api',
      newValues: { reason: input.reason.trim(), minutes: input.minutes },
    });
    return this.view(created, user.email);
  }

  async revoke(grantId: string, ctx: RequestContext): Promise<void> {
    const row = await this.prisma.breakGlassGrant.findFirst({
      where: { id: grantId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('BreakGlassGrant', grantId);
    if (row.revokedAt) {
      throw new DomainError('INVALID_STATE', 'Grant is already revoked');
    }
    await this.prisma.breakGlassGrant.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'iam.break_glass.revoke',
      objectType: 'User',
      objectId: row.userId,
      source: 'api',
      previousValues: { grantId: row.id },
    });
  }

  /** Is there an unexpired, unrevoked grant for this user right now? */
  async hasActiveGrant(tenantId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.breakGlassGrant.findFirst({
      where: { tenantId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return row !== null;
  }

  /** Record one break-glass use — every bypassed permission check is audited. */
  async recordUse(tenantId: string, userId: string, permissionKey: string): Promise<void> {
    await writeAudit(this.prisma, {
      tenantId,
      actorType: 'USER',
      actorId: userId,
      action: 'iam.break_glass.use',
      objectType: 'Permission',
      objectId: userId,
      source: 'api',
      newValues: { permission: permissionKey },
    });
  }
}

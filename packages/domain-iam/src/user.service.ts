import { writeAudit } from '@nexora/audit';
import type { PrismaClient, User } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * IAM — user lifecycle (IAM-001): invite, activate-by-link, suspend.
 * Suspended users cannot mutate business state (enforced by the auth guard
 * reading userStatus from the server-resolved context).
 */

export interface UserView {
  id: string;
  email: string;
  displayName: string;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toView(u: User): UserView {
  return { id: u.id, email: u.email, displayName: u.displayName, status: u.status };
}

export class UserService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Permission: iam.user.manage. */
  async listUsers(ctx: RequestContext): Promise<UserView[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { displayName: 'asc' },
      take: 200,
    });
    return users.map(toView);
  }

  /** Permission: iam.user.manage. Emits user.invited. */
  async inviteUser(
    input: { email: string; displayName: string; idpSubject?: string | undefined },
    ctx: RequestContext,
  ): Promise<UserView> {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new DomainError('VALIDATION_FAILED', 'A valid email is required', {
        fieldErrors: { email: 'invalid format' },
      });
    }
    if (input.displayName.trim().length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Display name is required');
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { tenantId_email: { tenantId: ctx.tenantId, email } },
      });
      if (existing) {
        throw new DomainError('CONFLICT', 'A user with this email already exists in the tenant');
      }
      const user = await tx.user.create({
        data: {
          tenantId: ctx.tenantId,
          email,
          displayName: input.displayName.trim(),
          idpSubject: input.idpSubject ?? null,
          // Dev-linked users become ACTIVE immediately when an IdP subject is
          // provided; otherwise they stay INVITED until first IdP login links them.
          status: input.idpSubject ? 'ACTIVE' : 'INVITED',
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'user.invite',
        objectType: 'User',
        objectId: user.id,
        source: 'api',
        newValues: { email: user.email, status: user.status },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.USER_INVITED,
        aggregateType: 'User',
        aggregateId: user.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { userId: user.id, email: user.email },
      });
      return toView(user);
    });
  }

  /** Permission: iam.user.manage. Suspension takes effect on the next request. */
  async suspendUser(userId: string, reason: string, ctx: RequestContext): Promise<UserView> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, tenantId: ctx.tenantId } });
      if (!user) throw notFound('User', userId);
      if (user.status === 'SUSPENDED') {
        throw new DomainError('INVALID_STATE', 'User is already suspended');
      }
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { status: 'SUSPENDED' },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'user.suspend',
        objectType: 'User',
        objectId: user.id,
        source: 'api',
        previousValues: { status: user.status },
        newValues: { status: 'SUSPENDED' },
        reason,
      });
      return toView(updated);
    });
  }

  async getUser(userId: string, ctx: RequestContext): Promise<UserView> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: ctx.tenantId },
    });
    if (!user) throw notFound('User', userId);
    return toView(user);
  }

  /** Server-side identity resolution for the auth guard (never client input). */
  async findByIdpSubject(tenantId: string, idpSubject: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { tenantId, idpSubject } });
  }
}

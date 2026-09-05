import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Sales territories (CRM-005): named commercial areas with an optional
 * responsible rep. Accounts attach to at most one territory; the
 * assignment is audited like every commercial mutation.
 */

export interface TerritoryView {
  id: string;
  code: string;
  name: string;
  ownerUserId: string | null;
  accountCount: number;
}

export class TerritoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async listTerritories(ctx: RequestContext): Promise<TerritoryView[]> {
    const territories = await this.prisma.territory.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { code: 'asc' },
      take: 200,
    });
    const counts = await this.prisma.crmAccount.groupBy({
      by: ['territoryId'],
      where: { tenantId: ctx.tenantId, territoryId: { not: null } },
      _count: { _all: true },
    });
    const countById = new Map(counts.map((c) => [c.territoryId, c._count._all]));
    return territories.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      ownerUserId: t.ownerUserId,
      accountCount: countById.get(t.id) ?? 0,
    }));
  }

  async createTerritory(
    input: { code: string; name: string; ownerUserId?: string | undefined },
    ctx: RequestContext,
  ): Promise<TerritoryView> {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    if (!code || !name) {
      throw new DomainError('VALIDATION_FAILED', 'Code and name are required');
    }
    if (input.ownerUserId) {
      const owner = await this.prisma.user.findFirst({
        where: { id: input.ownerUserId, tenantId: ctx.tenantId },
      });
      if (!owner) throw notFound('User', input.ownerUserId);
    }
    try {
      const territory = await this.prisma.$transaction(async (tx) => {
        const created = await tx.territory.create({
          data: {
            tenantId: ctx.tenantId,
            code,
            name,
            ownerUserId: input.ownerUserId ?? null,
          },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'crm.territory.create',
          objectType: 'Territory',
          objectId: created.id,
          source: 'api',
          newValues: { code, name },
        });
        return created;
      });
      return {
        id: territory.id,
        code: territory.code,
        name: territory.name,
        ownerUserId: territory.ownerUserId,
        accountCount: 0,
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', `Territory '${code}' already exists`);
      }
      throw error;
    }
  }

  /** Assigns (or clears, with null) an account's territory. */
  async assignTerritory(
    accountId: string,
    territoryId: string | null,
    ctx: RequestContext,
  ): Promise<void> {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw notFound('CrmAccount', accountId);
    if (territoryId) {
      const territory = await this.prisma.territory.findFirst({
        where: { id: territoryId, tenantId: ctx.tenantId },
      });
      if (!territory) throw notFound('Territory', territoryId);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.crmAccount.update({
        where: { id: account.id },
        data: { territoryId },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'crm.account.territory',
        objectType: 'CrmAccount',
        objectId: account.id,
        source: 'api',
        previousValues: { territoryId: account.territoryId },
        newValues: { territoryId },
      });
    });
  }
}

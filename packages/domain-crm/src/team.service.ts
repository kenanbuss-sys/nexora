import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Sales teams (CRM): named selling units with members drawn from the
 * tenant's users. A territory can be covered by one team, so ownership
 * of customers rolls up cleanly: account → territory → team.
 */

export interface TeamMemberView {
  id: string;
  userId: string;
  displayName: string;
  email: string;
}

export interface SalesTeamView {
  id: string;
  code: string;
  name: string;
  members: TeamMemberView[];
  territoryCount: number;
}

export class SalesTeamService {
  constructor(private readonly prisma: PrismaClient) {}

  async listTeams(ctx: RequestContext): Promise<SalesTeamView[]> {
    const teams = await this.prisma.salesTeam.findMany({
      where: { tenantId: ctx.tenantId },
      include: { members: true },
      orderBy: { code: 'asc' },
      take: 100,
    });
    const userIds = [...new Set(teams.flatMap((t) => t.members.map((m) => m.userId)))];
    const users = await this.prisma.user.findMany({
      where: { tenantId: ctx.tenantId, id: { in: userIds } },
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    const territoryCounts = await this.prisma.territory.groupBy({
      by: ['teamId'],
      where: { tenantId: ctx.tenantId, teamId: { not: null } },
      _count: { _all: true },
    });
    const countByTeam = new Map(territoryCounts.map((c) => [c.teamId, c._count._all]));
    return teams.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      members: t.members.map((m) => {
        const user = userById.get(m.userId);
        return {
          id: m.id,
          userId: m.userId,
          displayName: user?.displayName ?? '(unknown)',
          email: user?.email ?? '',
        };
      }),
      territoryCount: countByTeam.get(t.id) ?? 0,
    }));
  }

  async createTeam(
    input: { code: string; name: string },
    ctx: RequestContext,
  ): Promise<SalesTeamView> {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    if (!code || !name) throw new DomainError('VALIDATION_FAILED', 'Code and name are required');
    try {
      const team = await this.prisma.$transaction(async (tx) => {
        const created = await tx.salesTeam.create({
          data: { tenantId: ctx.tenantId, code, name },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'crm.team.create',
          objectType: 'SalesTeam',
          objectId: created.id,
          source: 'api',
          newValues: { code, name },
        });
        return created;
      });
      return { id: team.id, code: team.code, name: team.name, members: [], territoryCount: 0 };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', `Team '${code}' already exists`);
      }
      throw error;
    }
  }

  async addMember(teamId: string, userId: string, ctx: RequestContext): Promise<void> {
    const team = await this.prisma.salesTeam.findFirst({
      where: { id: teamId, tenantId: ctx.tenantId },
    });
    if (!team) throw notFound('SalesTeam', teamId);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: ctx.tenantId },
    });
    if (!user) throw notFound('User', userId);
    try {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.salesTeamMember.create({
          data: { tenantId: ctx.tenantId, teamId, userId },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'crm.team.member.add',
          objectType: 'SalesTeamMember',
          objectId: created.id,
          source: 'api',
          newValues: { teamId, userId },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', 'This user is already on the team');
      }
      throw error;
    }
  }

  async removeMember(memberId: string, ctx: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.salesTeamMember.findFirst({
        where: { id: memberId, tenantId: ctx.tenantId },
      });
      if (!existing) throw notFound('SalesTeamMember', memberId);
      await tx.salesTeamMember.delete({ where: { id: existing.id } });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'crm.team.member.remove',
        objectType: 'SalesTeamMember',
        objectId: existing.id,
        source: 'api',
        previousValues: { teamId: existing.teamId, userId: existing.userId },
      });
    });
  }

  /** Assigns (or clears) the team covering a territory. */
  async assignTerritory(
    territoryId: string,
    teamId: string | null,
    ctx: RequestContext,
  ): Promise<void> {
    const territory = await this.prisma.territory.findFirst({
      where: { id: territoryId, tenantId: ctx.tenantId },
    });
    if (!territory) throw notFound('Territory', territoryId);
    if (teamId) {
      const team = await this.prisma.salesTeam.findFirst({
        where: { id: teamId, tenantId: ctx.tenantId },
      });
      if (!team) throw notFound('SalesTeam', teamId);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.territory.update({ where: { id: territory.id }, data: { teamId } });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'crm.territory.team',
        objectType: 'Territory',
        objectId: territory.id,
        source: 'api',
        previousValues: { teamId: territory.teamId },
        newValues: { teamId },
      });
    });
  }
}

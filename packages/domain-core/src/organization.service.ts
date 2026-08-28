import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * CORE — organization hierarchy (CORE-002):
 * LegalEntity -> BusinessUnit (nested) -> Branch / Factory.
 * All nodes are tenant-owned; references can never cross tenants.
 */

export interface OrgNodeView {
  id: string;
  name: string;
}

export interface OrganizationTree {
  legalEntities: Array<{
    id: string;
    name: string;
    code: string | null;
    businessUnits: Array<{
      id: string;
      name: string;
      parentId: string | null;
      branches: OrgNodeView[];
      factories: OrgNodeView[];
    }>;
  }>;
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new DomainError('VALIDATION_FAILED', 'Name is required');
  return trimmed;
}

export class OrganizationService {
  constructor(private readonly prisma: PrismaClient) {}

  async createLegalEntity(
    input: { name: string; code?: string | undefined },
    ctx: RequestContext,
  ): Promise<OrgNodeView> {
    const name = requireName(input.name);
    return this.prisma.$transaction(async (tx) => {
      const entity = await tx.legalEntity.create({
        data: { tenantId: ctx.tenantId, name, code: input.code ?? null },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'organization.legal_entity.create',
        objectType: 'LegalEntity',
        objectId: entity.id,
        source: 'api',
        newValues: { name },
      });
      return { id: entity.id, name: entity.name };
    });
  }

  async createBusinessUnit(
    input: { legalEntityId: string; name: string; parentId?: string | undefined },
    ctx: RequestContext,
  ): Promise<OrgNodeView> {
    const name = requireName(input.name);
    return this.prisma.$transaction(async (tx) => {
      // Tenant-scoped lookups: a foreign id from another tenant is a 404.
      const legalEntity = await tx.legalEntity.findFirst({
        where: { id: input.legalEntityId, tenantId: ctx.tenantId },
      });
      if (!legalEntity) throw notFound('LegalEntity', input.legalEntityId);
      if (input.parentId) {
        const parent = await tx.businessUnit.findFirst({
          where: { id: input.parentId, tenantId: ctx.tenantId },
        });
        if (!parent) throw notFound('BusinessUnit', input.parentId);
        if (parent.legalEntityId !== legalEntity.id) {
          throw new DomainError(
            'VALIDATION_FAILED',
            'Parent business unit belongs to a different legal entity',
          );
        }
      }
      const unit = await tx.businessUnit.create({
        data: {
          tenantId: ctx.tenantId,
          legalEntityId: legalEntity.id,
          parentId: input.parentId ?? null,
          name,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'organization.business_unit.create',
        objectType: 'BusinessUnit',
        objectId: unit.id,
        source: 'api',
        newValues: { name, legalEntityId: legalEntity.id },
      });
      return { id: unit.id, name: unit.name };
    });
  }

  async createBranch(
    input: { businessUnitId: string; name: string },
    ctx: RequestContext,
  ): Promise<OrgNodeView> {
    return this.createSite('branch', input, ctx);
  }

  async createFactory(
    input: { businessUnitId: string; name: string },
    ctx: RequestContext,
  ): Promise<OrgNodeView> {
    return this.createSite('factory', input, ctx);
  }

  private async createSite(
    kind: 'branch' | 'factory',
    input: { businessUnitId: string; name: string },
    ctx: RequestContext,
  ): Promise<OrgNodeView> {
    const name = requireName(input.name);
    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.businessUnit.findFirst({
        where: { id: input.businessUnitId, tenantId: ctx.tenantId },
      });
      if (!unit) throw notFound('BusinessUnit', input.businessUnitId);
      const data = { tenantId: ctx.tenantId, businessUnitId: unit.id, name };
      const node =
        kind === 'branch' ? await tx.branch.create({ data }) : await tx.factory.create({ data });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: `organization.${kind}.create`,
        objectType: kind === 'branch' ? 'Branch' : 'Factory',
        objectId: node.id,
        source: 'api',
        newValues: { name, businessUnitId: unit.id },
      });
      return { id: node.id, name: node.name };
    });
  }

  async getTree(ctx: RequestContext): Promise<OrganizationTree> {
    const legalEntities = await this.prisma.legalEntity.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: 'asc' },
      include: {
        businessUnits: {
          orderBy: { name: 'asc' },
          include: {
            branches: { orderBy: { name: 'asc' } },
            factories: { orderBy: { name: 'asc' } },
          },
        },
      },
    });
    return {
      legalEntities: legalEntities.map((le) => ({
        id: le.id,
        name: le.name,
        code: le.code,
        businessUnits: le.businessUnits.map((bu) => ({
          id: bu.id,
          name: bu.name,
          parentId: bu.parentId,
          branches: bu.branches.map((b) => ({ id: b.id, name: b.name })),
          factories: bu.factories.map((f) => ({ id: f.id, name: f.name })),
        })),
      })),
    };
  }
}

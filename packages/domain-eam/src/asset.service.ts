import { writeAudit } from '@nexora/audit';
import type { AssetStatus, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Asset registry (EAM-001/002). Numbered physical assets with a
 * category, optional serial and work-center linkage, value, and an
 * explicit service lifecycle:
 *
 *   IN_SERVICE <-> UNDER_MAINTENANCE, either -> RETIRED (terminal)
 */

export interface AssetView {
  id: string;
  assetNumber: string;
  name: string;
  category: string;
  serialNumber: string | null;
  workCenterId: string | null;
  status: AssetStatus;
  value: string | null;
  purchasedAt: string | null;
}

const TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  IN_SERVICE: ['UNDER_MAINTENANCE', 'RETIRED'],
  UNDER_MAINTENANCE: ['IN_SERVICE', 'RETIRED'],
  RETIRED: [],
};

export class AssetService {
  constructor(private readonly prisma: PrismaClient) {}

  private toView(a: {
    id: string;
    assetNumber: string;
    name: string;
    category: string;
    serialNumber: string | null;
    workCenterId: string | null;
    status: AssetStatus;
    value: { toString(): string } | null;
    purchasedAt: Date | null;
  }): AssetView {
    return {
      id: a.id,
      assetNumber: a.assetNumber,
      name: a.name,
      category: a.category,
      serialNumber: a.serialNumber,
      workCenterId: a.workCenterId,
      status: a.status,
      value: a.value ? a.value.toString() : null,
      purchasedAt: a.purchasedAt ? a.purchasedAt.toISOString() : null,
    };
  }

  async listAssets(ctx: RequestContext): Promise<AssetView[]> {
    const rows = await this.prisma.asset.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ assetNumber: 'asc' }],
      take: 200,
    });
    return rows.map((r) => this.toView(r));
  }

  async createAsset(
    input: {
      name: string;
      category: string;
      serialNumber?: string | undefined;
      workCenterId?: string | undefined;
      value?: number | undefined;
      purchasedAt?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<AssetView> {
    if (!input.name?.trim() || !input.category?.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'Name and category are required');
    }
    if (input.value !== undefined && input.value < 0) {
      throw new DomainError('VALIDATION_FAILED', 'Value cannot be negative');
    }
    if (input.workCenterId) {
      const wc = await this.prisma.workCenter.findFirst({
        where: { id: input.workCenterId, tenantId: ctx.tenantId },
      });
      if (!wc) throw notFound('WorkCenter', input.workCenterId);
    }
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.asset.count({ where: { tenantId: ctx.tenantId } });
      const created = await tx.asset.create({
        data: {
          tenantId: ctx.tenantId,
          assetNumber: `AST-${String(count + 1).padStart(5, '0')}`,
          name: input.name.trim(),
          category: input.category.trim(),
          serialNumber: input.serialNumber?.trim() || null,
          workCenterId: input.workCenterId ?? null,
          value: input.value ?? null,
          purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'eam.asset.create',
        objectType: 'Asset',
        objectId: created.id,
        source: 'api',
        newValues: { assetNumber: created.assetNumber, name: created.name },
      });
      return this.toView(created);
    });
  }

  async transition(assetId: string, status: AssetStatus, ctx: RequestContext): Promise<AssetView> {
    const row = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('Asset', assetId);
    if (!TRANSITIONS[row.status].includes(status)) {
      throw new DomainError('INVALID_STATE', `An asset cannot go from ${row.status} to ${status}`);
    }
    const updated = await this.prisma.asset.update({ where: { id: row.id }, data: { status } });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'eam.asset.transition',
      objectType: 'Asset',
      objectId: row.id,
      source: 'api',
      previousValues: { status: row.status },
      newValues: { status },
    });
    return this.toView(updated);
  }
}

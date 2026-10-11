import { writeAudit } from '@nexora/audit';
import type { AssetStatus, Prisma, PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Asset registry (EAM-001/002). Numbered physical assets with a
 * category, optional serial and work-center linkage, value, and an
 * explicit service lifecycle:
 *
 *   IN_SERVICE <-> UNDER_MAINTENANCE, either -> RETIRED (terminal)
 *
 * Hierarchy (EAM-002): an asset may be installed in a parent (line >
 * machine > assembly > part). Structure changes are serialised per
 * tenant, refuse cycles and depth > MAX_DEPTH, and are kept as an
 * append-only, effective-dated history.
 */

/** Levels from a root to the deepest component (line > machine > assembly > ...). */
export const MAX_ASSET_DEPTH = 6;

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
  parentAssetId: string | null;
}

export interface AssetTreeNode {
  id: string;
  assetNumber: string;
  name: string;
  category: string;
  status: AssetStatus;
  parentAssetId: string | null;
  depth: number;
}

export interface AssetTree {
  /** Root first, the asset's direct parent last. */
  ancestors: AssetTreeNode[];
  asset: AssetTreeNode;
  /** Pre-ordered descendants with depth relative to the asset (1 = child). */
  descendants: AssetTreeNode[];
}

export interface StructureChangeView {
  id: string;
  assetId: string;
  fromParentId: string | null;
  toParentId: string | null;
  reason: string;
  changedBy: string | null;
  effectiveAt: string;
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
    parentAssetId: string | null;
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
      parentAssetId: a.parentAssetId,
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
      parentAssetId?: string | undefined;
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
      // Numbering is count-based: serialise creates per tenant so two
      // concurrent creates never collide on the same number.
      await lockTenantKey(tx, `eam.asset.number:${ctx.tenantId}`);
      if (input.parentAssetId) {
        await lockTenantKey(tx, `eam.structure:${ctx.tenantId}`);
        const parent = await tx.asset.findFirst({
          where: { id: input.parentAssetId, tenantId: ctx.tenantId },
        });
        if (!parent) throw notFound('Asset', input.parentAssetId);
        if (parent.status === 'RETIRED') {
          throw new DomainError('INVALID_STATE', 'Nothing can be installed in a retired asset');
        }
        const depth = (await this.ancestorIds(tx, ctx.tenantId, parent.id)).length + 1;
        if (depth + 1 > MAX_ASSET_DEPTH) {
          throw new DomainError(
            'VALIDATION_FAILED',
            `The asset structure may have at most ${MAX_ASSET_DEPTH} levels`,
          );
        }
      }
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
          parentAssetId: input.parentAssetId ?? null,
        },
      });
      if (created.parentAssetId) {
        await tx.assetStructureChange.create({
          data: {
            tenantId: ctx.tenantId,
            assetId: created.id,
            fromParentId: null,
            toParentId: created.parentAssetId,
            reason: 'Created installed in parent',
            changedBy: ctx.userId ?? null,
          },
        });
      }
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
    return this.prisma.$transaction(async (tx) => {
      if (status === 'RETIRED') await lockTenantKey(tx, `eam.structure:${ctx.tenantId}`);
      const row = await tx.asset.findFirst({
        where: { id: assetId, tenantId: ctx.tenantId },
      });
      if (!row) throw notFound('Asset', assetId);
      if (!TRANSITIONS[row.status].includes(status)) {
        throw new DomainError(
          'INVALID_STATE',
          `An asset cannot go from ${row.status} to ${status}`,
        );
      }
      if (status === 'RETIRED') {
        const live = await tx.asset.findMany({
          where: { tenantId: ctx.tenantId, parentAssetId: row.id, status: { not: 'RETIRED' } },
          select: { assetNumber: true },
          orderBy: { assetNumber: 'asc' },
        });
        if (live.length > 0) {
          throw new DomainError(
            'INVALID_STATE',
            `Remove or retire the installed components first (${live
              .map((c) => c.assetNumber)
              .join(', ')})`,
          );
        }
      }
      // CAS on the status: concurrent transitions cannot both apply.
      const flipped = await tx.asset.updateMany({
        where: { id: row.id, tenantId: ctx.tenantId, status: row.status },
        // EAM-016: a retired asset's public QR label stops resolving.
        data: { status, ...(status === 'RETIRED' ? { qrToken: null } : {}) },
      });
      if (flipped.count === 0) {
        throw new DomainError('CONFLICT', 'The asset changed concurrently — reload and retry');
      }
      await writeAudit(tx, {
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
      const updated = await tx.asset.findFirst({ where: { id: row.id } });
      return this.toView(updated!);
    });
  }

  /**
   * Permission: assets.manage. Install the asset into a parent, move it,
   * or remove it (parentAssetId null). Serialised per tenant so concurrent
   * moves cannot form a cycle; history row + audit + outbox event.
   */
  async setParent(
    assetId: string,
    input: { parentAssetId: string | null; reason: string },
    ctx: RequestContext,
  ): Promise<AssetView & { changed: boolean }> {
    const reason = input.reason?.trim() ?? '';
    if (reason.length < 3 || reason.length > 300) {
      throw new DomainError('VALIDATION_FAILED', 'A reason (3-300 characters) is required');
    }
    const parentId = input.parentAssetId ? input.parentAssetId.toLowerCase() : null;
    return this.prisma.$transaction(async (tx) => {
      await lockTenantKey(tx, `eam.structure:${ctx.tenantId}`);
      const asset = await tx.asset.findFirst({ where: { id: assetId, tenantId: ctx.tenantId } });
      if (!asset) throw notFound('Asset', assetId);
      if ((asset.parentAssetId ?? null) === parentId) {
        return { ...this.toView(asset), changed: false };
      }
      if (asset.status === 'RETIRED') {
        throw new DomainError('INVALID_STATE', 'A retired asset cannot be installed or moved');
      }
      if (parentId) {
        if (parentId === asset.id) {
          throw new DomainError('VALIDATION_FAILED', 'An asset cannot be installed in itself');
        }
        const parent = await tx.asset.findFirst({
          where: { id: parentId, tenantId: ctx.tenantId },
        });
        if (!parent) throw notFound('Asset', parentId);
        if (parent.status === 'RETIRED') {
          throw new DomainError('INVALID_STATE', 'Nothing can be installed in a retired asset');
        }
        const ancestors = await this.ancestorIds(tx, ctx.tenantId, parent.id);
        if (ancestors.includes(asset.id)) {
          throw new DomainError(
            'VALIDATION_FAILED',
            'This would make the asset part of its own component',
          );
        }
        const height = await this.subtreeHeight(tx, ctx.tenantId, asset.id);
        // parent's level (ancestors + 1) + the moved subtree's levels.
        if (ancestors.length + 1 + height > MAX_ASSET_DEPTH) {
          throw new DomainError(
            'VALIDATION_FAILED',
            `The asset structure may have at most ${MAX_ASSET_DEPTH} levels`,
          );
        }
      }
      const updated = await tx.asset.update({
        where: { id: asset.id },
        data: { parentAssetId: parentId },
      });
      const change = await tx.assetStructureChange.create({
        data: {
          tenantId: ctx.tenantId,
          assetId: asset.id,
          fromParentId: asset.parentAssetId,
          toParentId: parentId,
          reason,
          changedBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'eam.asset.structure',
        objectType: 'Asset',
        objectId: asset.id,
        source: 'api',
        previousValues: { parentAssetId: asset.parentAssetId },
        newValues: { parentAssetId: parentId, reason },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.ASSET_STRUCTURE_CHANGED,
        aggregateType: 'Asset',
        aggregateId: asset.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: {
          assetId: asset.id,
          fromParentId: asset.parentAssetId,
          toParentId: parentId,
          changeId: change.id,
        },
      });
      return { ...this.toView(updated), changed: true };
    });
  }

  /** Permission: assets.read. Path to the root and the whole installed subtree. */
  async tree(assetId: string, ctx: RequestContext): Promise<AssetTree> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId: ctx.tenantId },
    });
    if (!asset) throw notFound('Asset', assetId);
    const ancestors = await this.prisma.$queryRaw<Array<RawNode>>`
      WITH RECURSIVE up AS (
        SELECT a.*, 1 AS lvl FROM asset a
         WHERE a.tenant_id = ${ctx.tenantId}::uuid AND a.id = ${asset.parentAssetId}::uuid
        UNION ALL
        SELECT p.*, up.lvl + 1 FROM asset p JOIN up ON p.id = up.parent_asset_id
         WHERE p.tenant_id = ${ctx.tenantId}::uuid AND up.lvl < ${MAX_ASSET_DEPTH * 2}
      )
      SELECT id::text, asset_number, name, category, status::text, parent_asset_id::text, lvl
        FROM up ORDER BY lvl DESC`;
    const descendants = await this.prisma.$queryRaw<Array<RawNode & { path: string }>>`
      WITH RECURSIVE down AS (
        SELECT a.*, 1 AS lvl, a.asset_number::text AS path FROM asset a
         WHERE a.tenant_id = ${ctx.tenantId}::uuid AND a.parent_asset_id = ${asset.id}::uuid
        UNION ALL
        SELECT c.*, down.lvl + 1, down.path || '/' || c.asset_number FROM asset c
          JOIN down ON c.parent_asset_id = down.id
         WHERE c.tenant_id = ${ctx.tenantId}::uuid AND down.lvl < ${MAX_ASSET_DEPTH * 2}
      )
      SELECT id::text, asset_number, name, category, status::text, parent_asset_id::text, lvl, path
        FROM down ORDER BY path`;
    const node = (r: RawNode, depth: number): AssetTreeNode => ({
      id: r.id,
      assetNumber: r.asset_number,
      name: r.name,
      category: r.category,
      status: r.status as AssetStatus,
      parentAssetId: r.parent_asset_id,
      depth,
    });
    return {
      ancestors: ancestors.map((r, i) => node(r, i - ancestors.length)),
      asset: {
        id: asset.id,
        assetNumber: asset.assetNumber,
        name: asset.name,
        category: asset.category,
        status: asset.status,
        parentAssetId: asset.parentAssetId,
        depth: 0,
      },
      descendants: descendants.map((r) => node(r, Number(r.lvl))),
    };
  }

  /** Permission: assets.read. Effective-dated structure history (as part and as parent). */
  async structureHistory(assetId: string, ctx: RequestContext): Promise<StructureChangeView[]> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId: ctx.tenantId },
    });
    if (!asset) throw notFound('Asset', assetId);
    const rows = await this.prisma.assetStructureChange.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [{ assetId: asset.id }, { toParentId: asset.id }, { fromParentId: asset.id }],
      },
      orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      assetId: r.assetId,
      fromParentId: r.fromParentId,
      toParentId: r.toParentId,
      reason: r.reason,
      changedBy: r.changedBy,
      effectiveAt: r.effectiveAt.toISOString(),
    }));
  }

  private async ancestorIds(
    db: Prisma.TransactionClient,
    tenantId: string,
    fromId: string,
  ): Promise<string[]> {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE up AS (
        SELECT id, parent_asset_id, 1 AS lvl FROM asset
         WHERE tenant_id = ${tenantId}::uuid AND id = ${fromId}::uuid
        UNION ALL
        SELECT p.id, p.parent_asset_id, up.lvl + 1 FROM asset p JOIN up ON p.id = up.parent_asset_id
         WHERE p.tenant_id = ${tenantId}::uuid AND up.lvl < ${MAX_ASSET_DEPTH * 2}
      )
      SELECT id::text FROM up`;
    // Includes fromId itself (level 1) — the parent's own level counts.
    return rows.map((r) => r.id).filter((id) => id !== fromId);
  }

  /** Levels of the subtree rooted at the asset (a leaf = 1). */
  private async subtreeHeight(
    db: Prisma.TransactionClient,
    tenantId: string,
    rootId: string,
  ): Promise<number> {
    const rows = await db.$queryRaw<Array<{ h: number | null }>>`
      WITH RECURSIVE down AS (
        SELECT id, 1 AS lvl FROM asset WHERE tenant_id = ${tenantId}::uuid AND id = ${rootId}::uuid
        UNION ALL
        SELECT c.id, down.lvl + 1 FROM asset c JOIN down ON c.parent_asset_id = down.id
         WHERE c.tenant_id = ${tenantId}::uuid AND down.lvl < ${MAX_ASSET_DEPTH * 2}
      )
      SELECT max(lvl)::int AS h FROM down`;
    return rows[0]?.h ?? 1;
  }
}

type RawNode = {
  id: string;
  asset_number: string;
  name: string;
  category: string;
  status: string;
  parent_asset_id: string | null;
  lvl: number;
};

async function lockTenantKey(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

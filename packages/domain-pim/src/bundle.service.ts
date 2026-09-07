import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { AvailabilityGate } from './substitution.service';

/**
 * Bundles/kits (PIM-015). A bundle SKU is sold as one line but is made
 * of component SKUs in fixed quantities. Composition is single-level —
 * a component may not itself be a bundle — so explosion is exact and
 * cheap. Buildable quantity derives live from component availability:
 * the ledger stays the only truth, no stock is ever stored on the
 * bundle itself.
 */

export interface BundleComponentView {
  id: string;
  componentSkuId: string;
  componentCode: string;
  componentName: string;
  quantity: string;
  available: string;
}

export interface BundleView {
  components: BundleComponentView[];
  /** How many bundles current component stock could build. */
  buildable: number;
}

/** Cross-domain contract: stock truth is owned by WMS. */
export interface AssemblyStockGate {
  postMovement(
    input: {
      warehouseId: string;
      skuId: string;
      movementType: 'ISSUE' | 'RECEIPT';
      quantity: number;
      idempotencyKey: string;
      reason?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ movementId: string; duplicate: boolean }>;
}

export class BundleService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly availability: AvailabilityGate,
    private readonly stock?: AssemblyStockGate,
  ) {}

  /**
   * Kitting (WMS-022): physically assemble bundles — consume the
   * components (ISSUE per component) and receive the bundle SKU, all
   * as idempotent ledger movements keyed by the caller's assembleKey,
   * so a retried assembly can never double-move stock.
   */
  async assemble(
    input: { bundleSkuId: string; warehouseId: string; quantity: number; assembleKey: string },
    ctx: RequestContext,
  ): Promise<{ assembled: number; duplicate: boolean }> {
    if (!this.stock) {
      throw new DomainError('INVALID_STATE', 'Assembly is not configured');
    }
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be a positive integer');
    }
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(input.assembleKey)) {
      throw new DomainError('VALIDATION_FAILED', 'assembleKey must be 6-64 safe characters');
    }
    // Idempotent retry: if this assembleKey already produced its receipt,
    // acknowledge without re-checking buildable (stock already moved).
    const existing = await this.prisma.stockMovement.findFirst({
      where: {
        tenantId: ctx.tenantId,
        idempotencyKey: `assemble:${input.assembleKey}:receipt`,
      },
      select: { id: true },
    });
    if (existing) {
      return { assembled: input.quantity, duplicate: true };
    }
    const bundle = await this.getBundle(input.bundleSkuId, ctx);
    if (bundle.components.length === 0) {
      throw new DomainError('INVALID_STATE', 'This SKU has no bundle composition');
    }
    if (bundle.buildable < input.quantity) {
      throw new DomainError(
        'INVALID_STATE',
        `Only ${bundle.buildable} bundle(s) can be built from current stock`,
      );
    }
    let anyFresh = false;
    for (const component of bundle.components) {
      const result = await this.stock.postMovement(
        {
          warehouseId: input.warehouseId,
          skuId: component.componentSkuId,
          movementType: 'ISSUE',
          quantity: Number(component.quantity) * input.quantity,
          idempotencyKey: `assemble:${input.assembleKey}:issue:${component.componentSkuId}`,
          reason: 'Bundle assembly',
        },
        ctx,
      );
      if (!result.duplicate) anyFresh = true;
    }
    const receipt = await this.stock.postMovement(
      {
        warehouseId: input.warehouseId,
        skuId: input.bundleSkuId,
        movementType: 'RECEIPT',
        quantity: input.quantity,
        idempotencyKey: `assemble:${input.assembleKey}:receipt`,
        reason: 'Bundle assembly output',
      },
      ctx,
    );
    if (!receipt.duplicate) anyFresh = true;
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'pim.bundle.assemble',
      objectType: 'Sku',
      objectId: input.bundleSkuId,
      source: 'api',
      newValues: { quantity: input.quantity, assembleKey: input.assembleKey },
    });
    return { assembled: input.quantity, duplicate: !anyFresh };
  }

  private async requireSku(tenantId: string, skuId: string) {
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, tenantId } });
    if (!sku) throw notFound('Sku', skuId);
    return sku;
  }

  async getBundle(bundleSkuId: string, ctx: RequestContext): Promise<BundleView> {
    await this.requireSku(ctx.tenantId, bundleSkuId);
    const rows = await this.prisma.bundleComponent.findMany({
      where: { tenantId: ctx.tenantId, bundleSkuId },
      include: { componentSku: true },
      orderBy: [{ createdAt: 'asc' }],
    });
    let buildable = rows.length > 0 ? Number.POSITIVE_INFINITY : 0;
    const components: BundleComponentView[] = [];
    for (const row of rows) {
      const stock = await this.availability.totalAvailability(ctx.tenantId, row.componentSkuId);
      const per = Number(row.quantity);
      buildable = Math.min(buildable, per > 0 ? Math.floor(stock.available / per) : 0);
      components.push({
        id: row.id,
        componentSkuId: row.componentSkuId,
        componentCode: row.componentSku.code,
        componentName: row.componentSku.name,
        quantity: row.quantity.toString(),
        available: String(stock.available),
      });
    }
    return { components, buildable: Number.isFinite(buildable) ? buildable : 0 };
  }

  async setComponent(
    input: { bundleSkuId: string; componentSkuId: string; quantity: number },
    ctx: RequestContext,
  ): Promise<BundleComponentView[]> {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new DomainError('VALIDATION_FAILED', 'Component quantity must be positive');
    }
    if (input.bundleSkuId === input.componentSkuId) {
      throw new DomainError('VALIDATION_FAILED', 'A bundle cannot contain itself');
    }
    await this.requireSku(ctx.tenantId, input.bundleSkuId);
    const component = await this.requireSku(ctx.tenantId, input.componentSkuId);
    if (component.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', `Component ${component.code} is not active`);
    }
    // Single-level composition: the component must not be a bundle, and
    // the bundle must not already be used as a component elsewhere.
    const componentIsBundle = await this.prisma.bundleComponent.findFirst({
      where: { tenantId: ctx.tenantId, bundleSkuId: input.componentSkuId },
    });
    if (componentIsBundle) {
      throw new DomainError('INVALID_STATE', 'Nested bundles are not supported');
    }
    const bundleUsedAsComponent = await this.prisma.bundleComponent.findFirst({
      where: { tenantId: ctx.tenantId, componentSkuId: input.bundleSkuId },
    });
    if (bundleUsedAsComponent) {
      throw new DomainError(
        'INVALID_STATE',
        'This SKU is already a component of another bundle and cannot become a bundle itself',
      );
    }
    await this.prisma.bundleComponent.upsert({
      where: {
        tenantId_bundleSkuId_componentSkuId: {
          tenantId: ctx.tenantId,
          bundleSkuId: input.bundleSkuId,
          componentSkuId: input.componentSkuId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        bundleSkuId: input.bundleSkuId,
        componentSkuId: input.componentSkuId,
        quantity: input.quantity,
      },
      update: { quantity: input.quantity },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'pim.bundle.set_component',
      objectType: 'Sku',
      objectId: input.bundleSkuId,
      source: 'api',
      newValues: { componentSkuId: input.componentSkuId, quantity: input.quantity },
    });
    return (await this.getBundle(input.bundleSkuId, ctx)).components;
  }

  async removeComponent(
    bundleSkuId: string,
    componentId: string,
    ctx: RequestContext,
  ): Promise<void> {
    const row = await this.prisma.bundleComponent.findFirst({
      where: { id: componentId, tenantId: ctx.tenantId, bundleSkuId },
    });
    if (!row) throw notFound('BundleComponent', componentId);
    await this.prisma.bundleComponent.delete({ where: { id: row.id } });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'pim.bundle.remove_component',
      objectType: 'Sku',
      objectId: bundleSkuId,
      source: 'api',
      previousValues: { componentSkuId: row.componentSkuId },
    });
  }
}

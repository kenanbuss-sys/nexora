import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * PIM depth — category tree (PIM-004), product variants (PIM-002) and
 * typed attributes validated against the tenant's custom field
 * definitions for products (PIM-003).
 */

export interface CategoryView {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  productCount: number;
}

export interface VariantPlan {
  created: Array<{ skuId: string; code: string; variantValues: Record<string, string> }>;
  skipped: string[];
}

const AXIS_RE = /^[a-z][a-z0-9_]{1,29}$/;
const VALUE_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,39}$/u;

export class MerchandisingService {
  constructor(private readonly prisma: PrismaClient) {}

  // -------------------------------------------------------------- categories

  async listCategories(ctx: RequestContext): Promise<CategoryView[]> {
    const categories = await this.prisma.productCategory.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { code: 'asc' },
    });
    const counts = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: { tenantId: ctx.tenantId, categoryId: { not: null } },
      _count: { _all: true },
    });
    const countFor = (id: string): number =>
      counts.find((c) => c.categoryId === id)?._count._all ?? 0;
    return categories.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      parentId: c.parentId,
      productCount: countFor(c.id),
    }));
  }

  async createCategory(
    input: { code: string; name: string; parentId?: string | undefined },
    ctx: RequestContext,
  ): Promise<CategoryView> {
    if (input.parentId) {
      const parent = await this.prisma.productCategory.findFirst({
        where: { id: input.parentId, tenantId: ctx.tenantId },
      });
      if (!parent) throw notFound('ProductCategory', input.parentId);
    }
    try {
      const category = await this.prisma.$transaction(async (tx) => {
        const created = await tx.productCategory.create({
          data: {
            tenantId: ctx.tenantId,
            code: input.code,
            name: input.name,
            parentId: input.parentId ?? null,
          },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'pim.category.create',
          objectType: 'ProductCategory',
          objectId: created.id,
          source: 'api',
          newValues: { code: input.code, name: input.name },
        });
        return created;
      });
      return {
        id: category.id,
        code: category.code,
        name: category.name,
        parentId: category.parentId,
        productCount: 0,
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', `Category '${input.code}' already exists`);
      }
      throw error;
    }
  }

  async assignCategory(
    productId: string,
    categoryId: string | null,
    ctx: RequestContext,
  ): Promise<void> {
    if (categoryId) {
      const category = await this.prisma.productCategory.findFirst({
        where: { id: categoryId, tenantId: ctx.tenantId },
      });
      if (!category) throw notFound('ProductCategory', categoryId);
    }
    const updated = await this.prisma.product.updateMany({
      where: { id: productId, tenantId: ctx.tenantId },
      data: { categoryId },
    });
    if (updated.count === 0) throw notFound('Product', productId);
  }

  // -------------------------------------------------------------- attributes

  /**
   * Sets typed product attributes (PIM-003), validated against the
   * tenant's custom field definitions with objectType 'product'.
   */
  async setAttributes(
    productId: string,
    attributes: Record<string, unknown>,
    ctx: RequestContext,
  ): Promise<void> {
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: { tenantId: ctx.tenantId, objectType: 'product', active: true },
    });
    const byKey = new Map(definitions.map((d) => [d.key, d]));
    for (const [key, value] of Object.entries(attributes)) {
      const definition = byKey.get(key);
      if (!definition) {
        throw new DomainError('VALIDATION_FAILED', `Unknown product attribute '${key}'`);
      }
      const ok =
        (definition.fieldType === 'TEXT' && typeof value === 'string') ||
        (definition.fieldType === 'NUMBER' && typeof value === 'number') ||
        (definition.fieldType === 'BOOLEAN' && typeof value === 'boolean') ||
        (definition.fieldType === 'DATE' &&
          typeof value === 'string' &&
          !Number.isNaN(Date.parse(value))) ||
        definition.fieldType === 'SELECT' ||
        definition.fieldType === 'JSON';
      if (!ok) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `Attribute '${key}' must be of type ${definition.fieldType}`,
        );
      }
    }
    for (const definition of definitions) {
      if (definition.required && attributes[definition.key] === undefined) {
        throw new DomainError('VALIDATION_FAILED', `Attribute '${definition.key}' is required`);
      }
    }
    const updated = await this.prisma.product.updateMany({
      where: { id: productId, tenantId: ctx.tenantId },
      data: { attributes: attributes as never },
    });
    if (updated.count === 0) throw notFound('Product', productId);
  }

  // ---------------------------------------------------------------- variants

  /**
   * Defines the product's variant axes and generates one SKU per value
   * combination (PIM-002). Codes are `${productCode}-${VALUES…}`;
   * combinations whose code already exists are skipped, so re-running
   * with more values only adds the new ones.
   */
  async generateVariants(
    productId: string,
    input: { axes: Record<string, string[]>; baseUom: string },
    ctx: RequestContext,
  ): Promise<VariantPlan> {
    const axisNames = Object.keys(input.axes);
    if (axisNames.length === 0 || axisNames.length > 3) {
      throw new DomainError('VALIDATION_FAILED', 'Use 1-3 variant axes');
    }
    for (const axis of axisNames) {
      if (!AXIS_RE.test(axis)) {
        throw new DomainError('VALIDATION_FAILED', `Invalid axis name '${axis}'`);
      }
      const values = input.axes[axis] ?? [];
      if (values.length === 0 || values.length > 20) {
        throw new DomainError('VALIDATION_FAILED', `Axis '${axis}' needs 1-20 values`);
      }
      for (const value of values) {
        if (!VALUE_RE.test(value)) {
          throw new DomainError('VALIDATION_FAILED', `Invalid value '${value}'`);
        }
      }
    }
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId: ctx.tenantId },
    });
    if (!product) throw notFound('Product', productId);

    // Cartesian product of axis values.
    let combos: Array<Record<string, string>> = [{}];
    for (const axis of axisNames) {
      const next: Array<Record<string, string>> = [];
      for (const combo of combos) {
        for (const value of input.axes[axis]!) {
          next.push({ ...combo, [axis]: value });
        }
      }
      combos = next;
    }
    if (combos.length > 100) {
      throw new DomainError('VALIDATION_FAILED', 'At most 100 variant combinations at once');
    }

    const created: VariantPlan['created'] = [];
    const skipped: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.product.updateMany({
        where: { id: product.id, tenantId: ctx.tenantId },
        data: { variantAxes: axisNames },
      });
      for (const combo of combos) {
        const suffix = axisNames
          .map((axis) => combo[axis]!.toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ''))
          .join('-');
        const code = `${product.code}-${suffix}`;
        const existing = await tx.sku.findUnique({
          where: { tenantId_code: { tenantId: ctx.tenantId, code } },
        });
        if (existing) {
          skipped.push(code);
          continue;
        }
        const name = `${product.name} (${axisNames.map((a) => combo[a]).join(', ')})`;
        const sku = await tx.sku.create({
          data: {
            tenantId: ctx.tenantId,
            productId: product.id,
            code,
            name,
            baseUom: input.baseUom,
            variantValues: combo,
          },
        });
        created.push({ skuId: sku.id, code, variantValues: combo });
      }
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'pim.variants.generate',
        objectType: 'Product',
        objectId: product.id,
        source: 'api',
        newValues: { axes: axisNames, created: created.length, skipped: skipped.length },
      });
    });
    return { created, skipped };
  }
}

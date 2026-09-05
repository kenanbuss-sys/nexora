import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * PIM — canonical product/SKU identity (PIM-*): products, SKUs, barcodes,
 * UOM conversions. Commercial/logistics identity only — engineering
 * revisions belong to ENG, stock belongs to WMS.
 */

export interface ProductView {
  id: string;
  code: string;
  name: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export interface SkuView {
  id: string;
  productId: string;
  code: string;
  name: string;
  baseUom: string;
  status: 'DRAFT' | 'ACTIVE' | 'DISCONTINUED';
}

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const UOM_RE = /^[a-zA-Z][a-zA-Z0-9]{0,15}$/;

export class CatalogService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Permission: product.manage. Emits product.created. */
  async createProduct(
    input: { code: string; name: string; description?: string | undefined },
    ctx: RequestContext,
  ): Promise<ProductView> {
    if (!CODE_RE.test(input.code)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid product code');
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } },
      });
      if (existing) throw new DomainError('CONFLICT', 'Product code already exists');
      const product = await tx.product.create({
        data: {
          tenantId: ctx.tenantId,
          code: input.code,
          name: input.name.trim(),
          description: input.description ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'product.create',
        objectType: 'Product',
        objectId: product.id,
        source: 'api',
        newValues: { code: product.code, name: product.name },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.PRODUCT_CREATED,
        aggregateType: 'Product',
        aggregateId: product.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { productId: product.id },
      });
      return { id: product.id, code: product.code, name: product.name, status: product.status };
    });
  }

  /** Permission: product.publish. */
  async publishProduct(productId: string, ctx: RequestContext): Promise<ProductView> {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, tenantId: ctx.tenantId },
      });
      if (!product) throw notFound('Product', productId);
      if (product.status === 'PUBLISHED') {
        throw new DomainError('INVALID_STATE', 'Product is already published');
      }
      const updated = await tx.product.update({
        where: { id: product.id },
        data: { status: 'PUBLISHED' },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'product.publish',
        objectType: 'Product',
        objectId: product.id,
        source: 'api',
        previousValues: { status: product.status },
        newValues: { status: 'PUBLISHED' },
      });
      return { id: updated.id, code: updated.code, name: updated.name, status: updated.status };
    });
  }

  async getProduct(
    productId: string,
    ctx: RequestContext,
  ): Promise<ProductView & { skus: SkuView[] }> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId: ctx.tenantId },
      include: { skus: { orderBy: { code: 'asc' } } },
    });
    if (!product) throw notFound('Product', productId);
    return {
      id: product.id,
      code: product.code,
      name: product.name,
      status: product.status,
      skus: product.skus.map((s) => ({
        id: s.id,
        productId: s.productId,
        code: s.code,
        name: s.name,
        baseUom: s.baseUom,
        status: s.status,
      })),
    };
  }

  async searchCatalog(query: string, ctx: RequestContext): Promise<ProductView[]> {
    const q = query.trim();
    const products = await this.prisma.product.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { code: 'asc' },
      take: 50,
    });
    return products.map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status }));
  }

  /** Permission: product.manage. */
  async createSku(
    input: { productId: string; code: string; name: string; baseUom: string },
    ctx: RequestContext,
  ): Promise<SkuView> {
    if (!CODE_RE.test(input.code)) throw new DomainError('VALIDATION_FAILED', 'Invalid SKU code');
    if (!UOM_RE.test(input.baseUom)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid base UOM');
    }
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: input.productId, tenantId: ctx.tenantId },
      });
      if (!product) throw notFound('Product', input.productId);
      const existing = await tx.sku.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } },
      });
      if (existing) throw new DomainError('CONFLICT', 'SKU code already exists');
      const sku = await tx.sku.create({
        data: {
          tenantId: ctx.tenantId,
          productId: product.id,
          code: input.code,
          name: input.name.trim(),
          baseUom: input.baseUom,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'sku.create',
        objectType: 'Sku',
        objectId: sku.id,
        source: 'api',
        newValues: { code: sku.code, baseUom: sku.baseUom },
      });
      return {
        id: sku.id,
        productId: sku.productId,
        code: sku.code,
        name: sku.name,
        baseUom: sku.baseUom,
        status: sku.status,
      };
    });
  }

  /** Permission: product.publish. Emits sku.activated. */
  async activateSku(skuId: string, ctx: RequestContext): Promise<SkuView> {
    return this.prisma.$transaction(async (tx) => {
      const sku = await tx.sku.findFirst({ where: { id: skuId, tenantId: ctx.tenantId } });
      if (!sku) throw notFound('Sku', skuId);
      if (sku.status === 'ACTIVE') {
        throw new DomainError('INVALID_STATE', 'SKU is already active');
      }
      if (sku.status === 'DISCONTINUED') {
        throw new DomainError('INVALID_STATE', 'A discontinued SKU cannot be reactivated');
      }
      const updated = await tx.sku.update({ where: { id: sku.id }, data: { status: 'ACTIVE' } });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'sku.activate',
        objectType: 'Sku',
        objectId: sku.id,
        source: 'api',
        previousValues: { status: sku.status },
        newValues: { status: 'ACTIVE' },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.SKU_ACTIVATED,
        aggregateType: 'Sku',
        aggregateId: sku.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { skuId: sku.id },
      });
      return {
        id: updated.id,
        productId: updated.productId,
        code: updated.code,
        name: updated.name,
        baseUom: updated.baseUom,
        status: updated.status,
      };
    });
  }

  /** Permission: product.manage. */
  async discontinueSku(skuId: string, ctx: RequestContext): Promise<SkuView> {
    return this.prisma.$transaction(async (tx) => {
      const sku = await tx.sku.findFirst({ where: { id: skuId, tenantId: ctx.tenantId } });
      if (!sku) throw notFound('Sku', skuId);
      if (sku.status === 'DISCONTINUED') {
        throw new DomainError('INVALID_STATE', 'SKU is already discontinued');
      }
      const updated = await tx.sku.update({
        where: { id: sku.id },
        data: { status: 'DISCONTINUED' },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'sku.discontinue',
        objectType: 'Sku',
        objectId: sku.id,
        source: 'api',
        previousValues: { status: sku.status },
        newValues: { status: 'DISCONTINUED' },
      });
      return {
        id: updated.id,
        productId: updated.productId,
        code: updated.code,
        name: updated.name,
        baseUom: updated.baseUom,
        status: updated.status,
      };
    });
  }

  /** Permission: product.barcode.manage. Barcode value unique per tenant. */
  async assignBarcode(
    input: { skuId: string; value: string; barcodeType?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    const value = input.value.trim();
    if (!/^[0-9A-Za-z-]{4,64}$/.test(value)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid barcode value');
    }
    return this.prisma.$transaction(async (tx) => {
      const sku = await tx.sku.findFirst({ where: { id: input.skuId, tenantId: ctx.tenantId } });
      if (!sku) throw notFound('Sku', input.skuId);
      const existing = await tx.barcode.findUnique({
        where: { tenantId_value: { tenantId: ctx.tenantId, value } },
      });
      if (existing) {
        throw new DomainError('CONFLICT', 'Barcode is already assigned in this tenant', { value });
      }
      await tx.barcode.create({
        data: {
          tenantId: ctx.tenantId,
          skuId: sku.id,
          value,
          barcodeType: input.barcodeType ?? 'GTIN',
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'sku.barcode.assign',
        objectType: 'Sku',
        objectId: sku.id,
        source: 'api',
        newValues: { barcode: value },
      });
      return { ok: true as const };
    });
  }

  /** Scan-path lookup: barcode -> SKU (+product). */
  async lookupBarcode(value: string, ctx: RequestContext): Promise<SkuView> {
    const barcode = await this.prisma.barcode.findUnique({
      where: { tenantId_value: { tenantId: ctx.tenantId, value: value.trim() } },
      include: { sku: true },
    });
    if (!barcode) throw notFound('Barcode', value);
    const sku = barcode.sku;
    return {
      id: sku.id,
      productId: sku.productId,
      code: sku.code,
      name: sku.name,
      baseUom: sku.baseUom,
      status: sku.status,
    };
  }

  /** Permission: product.manage. Conversion factor from a UOM to the base UOM. */
  async setUomConversion(
    input: { skuId: string; fromUom: string; toUom: string; factor: number },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    if (!UOM_RE.test(input.fromUom) || !UOM_RE.test(input.toUom)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid UOM');
    }
    if (!(input.factor > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Conversion factor must be positive');
    }
    return this.prisma.$transaction(async (tx) => {
      const sku = await tx.sku.findFirst({ where: { id: input.skuId, tenantId: ctx.tenantId } });
      if (!sku) throw notFound('Sku', input.skuId);
      await tx.uomConversion.upsert({
        where: {
          skuId_fromUom_toUom: { skuId: sku.id, fromUom: input.fromUom, toUom: input.toUom },
        },
        create: {
          tenantId: ctx.tenantId,
          skuId: sku.id,
          fromUom: input.fromUom,
          toUom: input.toUom,
          factor: input.factor,
        },
        update: { factor: input.factor },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'sku.uom_conversion.set',
        objectType: 'Sku',
        objectId: sku.id,
        source: 'api',
        newValues: { fromUom: input.fromUom, toUom: input.toUom, factor: input.factor },
      });
      return { ok: true as const };
    });
  }

  /** Public cross-domain gate: SKU identity + naming (used by CPQ). */
  async getSkuInfo(
    tenantId: string,
    skuId: string,
  ): Promise<{ exists: boolean; active: boolean; code: string; name: string } | null> {
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, tenantId } });
    if (!sku) return null;
    return { exists: true, active: sku.status === 'ACTIVE', code: sku.code, name: sku.name };
  }

  /** Public cross-domain gate: barcode -> SKU identity (used by VER). */
  async resolveBarcode(tenantId: string, value: string): Promise<string | null> {
    const barcode = await this.prisma.barcode.findUnique({
      where: { tenantId_value: { tenantId, value: value.trim() } },
    });
    return barcode ? barcode.skuId : null;
  }

  /** Public cross-domain gate: SKU existence/activity (used by WMS et al.). */
  async getSkuState(
    tenantId: string,
    skuId: string,
  ): Promise<{
    exists: boolean;
    active: boolean;
    lotTracked?: boolean;
    shelfLifeDays?: number | null;
  }> {
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, tenantId } });
    if (!sku) return { exists: false, active: false };
    return {
      exists: true,
      active: sku.status === 'ACTIVE',
      lotTracked: sku.lotTracked,
      shelfLifeDays: sku.shelfLifeDays,
    };
  }

  /** Lot policy (PIM-010/012): governed, audited configuration. */
  async setLotPolicy(
    skuId: string,
    input: { lotTracked: boolean; shelfLifeDays?: number | null | undefined },
    ctx: RequestContext,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.sku.updateMany({
        where: { id: skuId, tenantId: ctx.tenantId },
        data: {
          lotTracked: input.lotTracked,
          shelfLifeDays: input.shelfLifeDays ?? null,
        },
      });
      if (updated.count === 0) throw notFound('Sku', skuId);
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'pim.sku.lot_policy',
        objectType: 'Sku',
        objectId: skuId,
        source: 'api',
        newValues: { lotTracked: input.lotTracked, shelfLifeDays: input.shelfLifeDays ?? null },
      });
    });
  }

  async getUomConversions(
    skuId: string,
    ctx: RequestContext,
  ): Promise<Array<{ fromUom: string; toUom: string; factor: string }>> {
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, tenantId: ctx.tenantId } });
    if (!sku) throw notFound('Sku', skuId);
    const conversions = await this.prisma.uomConversion.findMany({ where: { skuId: sku.id } });
    return conversions.map((c) => ({
      fromUom: c.fromUom,
      toUom: c.toUom,
      factor: c.factor.toString(),
    }));
  }
}

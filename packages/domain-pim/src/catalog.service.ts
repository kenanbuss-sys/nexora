import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

import { isValidGtin } from './gtin';

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

/** MDM-002: tenant publish policy; checks report always, block only when enforced. */
export interface PublishPolicy {
  enforce: boolean;
  requireDescription: boolean;
  requireCategory: boolean;
  requireActiveSku: boolean;
  requireBarcode: boolean;
}

export const DEFAULT_PUBLISH_POLICY: PublishPolicy = {
  enforce: false,
  requireDescription: true,
  requireCategory: false,
  requireActiveSku: true,
  requireBarcode: false,
};

export interface PublishReadiness {
  ready: boolean;
  enforced: boolean;
  checks: Array<{ key: string; ok: boolean; message: string }>;
}

/** PIM-005: supported symbologies; GTIN is check-digit validated. */
export const BARCODE_TYPES = new Set(['GTIN', 'CODE128', 'CODE39', 'QR', 'DATAMATRIX', 'INTERNAL']);

export interface ScanResolution {
  kind: 'UNIT' | 'PACK' | 'SKU_CODE';
  code: string;
  skuId: string;
  skuCode: string;
  name: string;
  baseUom: string;
  status: string;
  /** Base units represented by one scan of this code. */
  unitsPerScan: string;
  packName: string | null;
  barcodeType: string | null;
}

function scanView(
  kind: ScanResolution['kind'],
  code: string,
  sku: { id: string; code: string; name: string; baseUom: string; status: string },
  unitsPerScan: string,
  packName: string | null,
  barcodeType: string | null,
): ScanResolution {
  return {
    kind,
    code,
    skuId: sku.id,
    skuCode: sku.code,
    name: sku.name,
    baseUom: sku.baseUom,
    status: sku.status,
    unitsPerScan,
    packName,
    barcodeType,
  };
}

/**
 * Unit and pack barcodes live in two tables but one scan namespace; a
 * per-(tenant, code) transaction lock serialises the cross-table check.
 */
export async function lockScanCode(
  tx: Prisma.TransactionClient,
  tenantId: string,
  value: string,
): Promise<void> {
  const key = `pim.scan:${tenantId}:${value}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
const CHANNEL_RE = /^[a-z][a-z0-9_-]{1,31}$/;

export interface ChannelContentView {
  skuId: string;
  channel: string;
  title: string;
  description: string | null;
  attributes: Record<string, unknown> | null;
  canonicalName: string;
}

function toChannelContentView(
  row: {
    skuId: string;
    channel: string;
    title: string;
    description: string | null;
    attributes: unknown;
  },
  canonicalName: string,
): ChannelContentView {
  return {
    skuId: row.skuId,
    channel: row.channel,
    title: row.title,
    description: row.description,
    attributes: (row.attributes ?? null) as Record<string, unknown> | null,
    canonicalName,
  };
}

/** Cross-domain contract: the UOM catalog is owned by MDM (MDM-004). */
export interface UomMasterGate {
  assertValid(tenantId: string, code: string): Promise<void>;
}

export class CatalogService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly uoms?: UomMasterGate,
    private readonly configuration?: {
      getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
    },
  ) {}

  /** MDM-002: tenant publish policy (versioned configuration `pim.publishPolicy`). */
  private async publishPolicy(tenantId: string): Promise<PublishPolicy> {
    const defaults: PublishPolicy = { ...DEFAULT_PUBLISH_POLICY };
    if (!this.configuration) return defaults;
    const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
    const pim = ((config as Record<string, unknown> | null)?.pim ?? {}) as Record<string, unknown>;
    const raw = (pim.publishPolicy ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(defaults) as Array<keyof PublishPolicy>) {
      if (typeof raw[key] === 'boolean') defaults[key] = raw[key] as boolean;
    }
    return defaults;
  }

  /**
   * Permission: product.read. Publish readiness checklist (MDM-002). The
   * checks always report; they BLOCK publishing only when the tenant's
   * policy sets `enforce`.
   */
  async publishReadiness(
    productId: string,
    ctx: RequestContext,
    db: Prisma.TransactionClient | PrismaClient = this.prisma,
  ): Promise<PublishReadiness> {
    const product = await db.product.findFirst({
      where: { id: productId, tenantId: ctx.tenantId },
      include: { skus: { include: { barcodes: { select: { id: true } } } } },
    });
    if (!product) throw notFound('Product', productId);
    const policy = await this.publishPolicy(ctx.tenantId);
    const active = product.skus.filter((sku) => sku.status === 'ACTIVE');
    const checks: PublishReadiness['checks'] = [];
    if (policy.requireDescription) {
      checks.push({
        key: 'description',
        ok: !!product.description?.trim(),
        message: 'Product has a description',
      });
    }
    if (policy.requireCategory) {
      checks.push({ key: 'category', ok: !!product.categoryId, message: 'Product has a category' });
    }
    if (policy.requireActiveSku) {
      checks.push({
        key: 'activeSku',
        ok: active.length > 0,
        message: 'At least one SKU is active',
      });
    }
    if (policy.requireBarcode) {
      const missing = active.filter((sku) => sku.barcodes.length === 0).map((sku) => sku.code);
      checks.push({
        key: 'barcode',
        ok: missing.length === 0,
        message:
          missing.length === 0
            ? 'Every active SKU has a barcode'
            : `Active SKUs without a barcode: ${missing.join(', ')}`,
      });
    }
    return { ready: checks.every((c) => c.ok), enforced: policy.enforce, checks };
  }

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
      // Row lock: concurrent publishes serialise; the readiness check below
      // reads inside this transaction (MDM-002).
      await tx.$queryRaw`SELECT id FROM product WHERE id = ${productId}::uuid AND tenant_id = ${ctx.tenantId}::uuid FOR UPDATE`;
      const product = await tx.product.findFirst({
        where: { id: productId, tenantId: ctx.tenantId },
      });
      if (!product) throw notFound('Product', productId);
      if (product.status === 'PUBLISHED') {
        throw new DomainError('INVALID_STATE', 'Product is already published');
      }
      if (product.status === 'ARCHIVED') {
        throw new DomainError('INVALID_STATE', 'An archived product cannot be published');
      }
      const readiness = await this.publishReadiness(product.id, ctx, tx);
      if (readiness.enforced && !readiness.ready) {
        const failing = readiness.checks.filter((c) => !c.ok);
        throw new DomainError(
          'INVALID_STATE',
          `Publish policy not met: ${failing.map((c) => c.message).join('; ')}`,
          { failing: failing.map((c) => c.key) },
        );
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

  /**
   * Lifecycle end state (PIM-016): archiving demands every SKU already
   * discontinued — the blocked action explains itself. Archived products
   * accept no new SKUs and cannot be re-published.
   */
  async archiveProduct(productId: string, ctx: RequestContext): Promise<ProductView> {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, tenantId: ctx.tenantId },
        include: { skus: true },
      });
      if (!product) throw notFound('Product', productId);
      if (product.status === 'ARCHIVED') {
        throw new DomainError('INVALID_STATE', 'Product is already archived');
      }
      const live = product.skus.filter((sku) => sku.status !== 'DISCONTINUED');
      if (live.length > 0) {
        throw new DomainError(
          'INVALID_STATE',
          `Discontinue the remaining SKUs first (${live.map((sku) => sku.code).join(', ')})`,
        );
      }
      const updated = await tx.product.update({
        where: { id: product.id },
        data: { status: 'ARCHIVED' },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'product.archive',
        objectType: 'Product',
        objectId: product.id,
        source: 'api',
        previousValues: { status: product.status },
        newValues: { status: 'ARCHIVED' },
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

  /**
   * Governed update (MDM-006): applied ONLY through the master data
   * approval flow; the audit trail carries before/after values.
   */
  async applyGovernedUpdate(
    productId: string,
    changes: { name?: string | undefined; description?: string | undefined },
    ctx: RequestContext,
  ): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId: ctx.tenantId },
    });
    if (!product) throw notFound('Product', productId);
    const data: Record<string, unknown> = {};
    if (changes.name !== undefined) data.name = changes.name.trim();
    if (changes.description !== undefined) data.description = changes.description.trim();
    if (Object.keys(data).length === 0) return;
    await this.prisma.product.update({ where: { id: product.id }, data });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'pim.product.governed_update',
      objectType: 'Product',
      objectId: product.id,
      source: 'api',
      previousValues: { name: product.name, description: product.description },
      newValues: data as Prisma.InputJsonValue,
    });
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
    if (this.uoms) await this.uoms.assertValid(ctx.tenantId, input.baseUom);
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: input.productId, tenantId: ctx.tenantId },
      });
      if (!product) throw notFound('Product', input.productId);
      if (product.status === 'ARCHIVED') {
        throw new DomainError('INVALID_STATE', 'An archived product cannot take new SKUs');
      }
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

  /**
   * Permission: product.barcode.manage. Barcode value unique per tenant
   * across BOTH unit barcodes and pack barcodes (one scan namespace).
   * Type GTIN (default) must carry a valid GS1 check digit (PIM-005).
   */
  async assignBarcode(
    input: { skuId: string; value: string; barcodeType?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    const value = input.value.trim();
    if (!/^[0-9A-Za-z-]{4,64}$/.test(value)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid barcode value');
    }
    const barcodeType = (input.barcodeType ?? 'GTIN').trim().toUpperCase();
    if (!BARCODE_TYPES.has(barcodeType)) {
      throw new DomainError('VALIDATION_FAILED', 'Unknown barcode type', {
        allowed: [...BARCODE_TYPES],
      });
    }
    if (barcodeType === 'GTIN' && !isValidGtin(value)) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Not a valid GTIN (8/12/13/14 digits with a correct check digit)',
        { value },
      );
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const sku = await tx.sku.findFirst({ where: { id: input.skuId, tenantId: ctx.tenantId } });
        if (!sku) throw notFound('Sku', input.skuId);
        await lockScanCode(tx, ctx.tenantId, value);
        const [existing, pack] = await Promise.all([
          tx.barcode.findUnique({
            where: { tenantId_value: { tenantId: ctx.tenantId, value } },
          }),
          tx.packagingLevel.findUnique({
            where: { tenantId_barcodeValue: { tenantId: ctx.tenantId, barcodeValue: value } },
          }),
        ]);
        if (existing) {
          throw new DomainError('CONFLICT', 'Barcode is already assigned in this tenant', {
            value,
          });
        }
        if (pack) {
          throw new DomainError('CONFLICT', 'This barcode already identifies a pack level', {
            value,
          });
        }
        await tx.barcode.create({
          data: { tenantId: ctx.tenantId, skuId: sku.id, value, barcodeType },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'sku.barcode.assign',
          objectType: 'Sku',
          objectId: sku.id,
          source: 'api',
          newValues: { barcode: value, barcodeType },
        });
        return { ok: true as const };
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', 'Barcode is already assigned in this tenant', { value });
      }
      throw error;
    }
  }

  /** Permission: product.read. Unit barcodes of one SKU. */
  async listBarcodes(
    skuId: string,
    ctx: RequestContext,
  ): Promise<Array<{ value: string; barcodeType: string; createdAt: string }>> {
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, tenantId: ctx.tenantId } });
    if (!sku) throw notFound('Sku', skuId);
    const rows = await this.prisma.barcode.findMany({
      where: { tenantId: ctx.tenantId, skuId: sku.id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((b) => ({
      value: b.value,
      barcodeType: b.barcodeType,
      createdAt: b.createdAt.toISOString(),
    }));
  }

  /** Permission: product.barcode.manage. Unassigns a unit barcode (audited). */
  async removeBarcode(value: string, ctx: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.barcode.findUnique({
        where: { tenantId_value: { tenantId: ctx.tenantId, value: value.trim() } },
      });
      if (!existing) throw notFound('Barcode', value);
      await tx.barcode.delete({ where: { id: existing.id } });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'sku.barcode.remove',
        objectType: 'Sku',
        objectId: existing.skuId,
        source: 'api',
        previousValues: { barcode: existing.value, barcodeType: existing.barcodeType },
      });
    });
  }

  /**
   * Permission: product.read. Unified scan resolver (PIM-005/007): a
   * unit barcode, a pack barcode or a SKU code resolves to the SKU and
   * the number of BASE units one scan represents.
   */
  async resolveScan(value: string, ctx: RequestContext): Promise<ScanResolution> {
    const code = value.trim();
    if (!code || code.length > 64) throw notFound('Barcode', value);
    const unit = await this.prisma.barcode.findUnique({
      where: { tenantId_value: { tenantId: ctx.tenantId, value: code } },
      include: { sku: true },
    });
    if (unit) return scanView('UNIT', code, unit.sku, '1', null, unit.barcodeType);
    const pack = await this.prisma.packagingLevel.findUnique({
      where: { tenantId_barcodeValue: { tenantId: ctx.tenantId, barcodeValue: code } },
      include: { sku: true },
    });
    if (pack) {
      return scanView('PACK', code, pack.sku, pack.unitsPerPack.toString(), pack.name, null);
    }
    const sku = await this.prisma.sku.findFirst({ where: { tenantId: ctx.tenantId, code } });
    if (sku) return scanView('SKU_CODE', code, sku, '1', null, null);
    throw notFound('Barcode', code);
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
    if (this.uoms) {
      await this.uoms.assertValid(ctx.tenantId, input.fromUom);
      await this.uoms.assertValid(ctx.tenantId, input.toUom);
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
    serialPolicy?: string;
    baseUom?: string;
  }> {
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, tenantId } });
    if (!sku) return { exists: false, active: false };
    return {
      exists: true,
      active: sku.status === 'ACTIVE',
      baseUom: sku.baseUom,
      lotTracked: sku.lotTracked,
      shelfLifeDays: sku.shelfLifeDays,
      serialPolicy: sku.serialPolicy,
    };
  }

  /**
   * Public cross-domain gate (PIM-007): converts a quantity entered in
   * `uom` into the SKU's base UOM. Uses the SKU's conversion uom->base
   * (multiply) or base->uom (divide). The result must be exact at the
   * ledger scale (6 decimals) — no silent rounding of stock.
   */
  async toBaseQuantity(
    tenantId: string,
    skuId: string,
    uom: string,
    quantity: number,
  ): Promise<{ baseQuantity: number; baseUom: string; factor: string }> {
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, tenantId } });
    if (!sku) throw notFound('Sku', skuId);
    if (uom === sku.baseUom) return { baseQuantity: quantity, baseUom: sku.baseUom, factor: '1' };
    const conversions = await this.prisma.uomConversion.findMany({
      where: {
        tenantId,
        skuId: sku.id,
        OR: [
          { fromUom: uom, toUom: sku.baseUom },
          { fromUom: sku.baseUom, toUom: uom },
        ],
      },
    });
    const direct = conversions.find((c) => c.fromUom === uom);
    const inverse = conversions.find((c) => c.fromUom === sku.baseUom);
    let base: Prisma.Decimal;
    let factor: string;
    if (direct) {
      base = direct.factor.mul(quantity);
      factor = direct.factor.toString();
    } else if (inverse) {
      const Dec = inverse.factor.constructor as new (v: number) => Prisma.Decimal;
      base = new Dec(quantity).div(inverse.factor);
      factor = `1/${inverse.factor.toString()}`;
    } else {
      throw new DomainError('VALIDATION_FAILED', 'No conversion from this UOM to the base UOM', {
        uom,
        baseUom: sku.baseUom,
      });
    }
    if (base.decimalPlaces() > 6) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Quantity does not convert exactly into the base UOM',
        { uom, quantity, baseUom: sku.baseUom },
      );
    }
    return { baseQuantity: base.toNumber(), baseUom: sku.baseUom, factor };
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

  /** Logistics data (PIM-009): weight and dimensions per base unit. */
  async setLogistics(
    skuId: string,
    input: {
      weightKg?: number | null | undefined;
      lengthCm?: number | null | undefined;
      widthCm?: number | null | undefined;
      heightCm?: number | null | undefined;
    },
    ctx: RequestContext,
  ): Promise<void> {
    for (const [key, value] of Object.entries(input)) {
      if (value !== null && value !== undefined && !(value > 0)) {
        throw new DomainError('VALIDATION_FAILED', `${key} must be positive when set`);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.sku.updateMany({
        where: { id: skuId, tenantId: ctx.tenantId },
        data: {
          weightKg: input.weightKg ?? null,
          lengthCm: input.lengthCm ?? null,
          widthCm: input.widthCm ?? null,
          heightCm: input.heightCm ?? null,
        },
      });
      if (updated.count === 0) throw notFound('Sku', skuId);
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'pim.sku.logistics',
        objectType: 'Sku',
        objectId: skuId,
        source: 'api',
        newValues: {
          weightKg: input.weightKg ?? null,
          lengthCm: input.lengthCm ?? null,
          widthCm: input.widthCm ?? null,
          heightCm: input.heightCm ?? null,
        },
      });
    });
  }

  /**
   * PIM-009 — channel-specific content. One canonical SKU, per-channel
   * commercial copy (title/description/attributes) keyed by channel code;
   * upsert is idempotent per (sku, channel). Permission: product.manage.
   */
  async setChannelContent(
    skuId: string,
    input: {
      channel: string;
      title: string;
      description?: string | undefined;
      attributes?: Record<string, unknown> | undefined;
    },
    ctx: RequestContext,
  ): Promise<ChannelContentView> {
    if (!CHANNEL_RE.test(input.channel)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid channel code');
    }
    if (!input.title.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'Title is required');
    }
    return this.prisma.$transaction(async (tx) => {
      const sku = await tx.sku.findFirst({ where: { id: skuId, tenantId: ctx.tenantId } });
      if (!sku) throw notFound('Sku', skuId);
      const row = await tx.skuChannelContent.upsert({
        where: {
          tenantId_skuId_channel: { tenantId: ctx.tenantId, skuId: sku.id, channel: input.channel },
        },
        create: {
          tenantId: ctx.tenantId,
          skuId: sku.id,
          channel: input.channel,
          title: input.title.trim(),
          description: input.description ?? null,
          ...(input.attributes ? { attributes: input.attributes as Prisma.InputJsonValue } : {}),
          updatedBy: ctx.userId ?? null,
        },
        update: {
          title: input.title.trim(),
          description: input.description ?? null,
          ...(input.attributes ? { attributes: input.attributes as Prisma.InputJsonValue } : {}),
          updatedBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'pim.channel_content.set',
        objectType: 'Sku',
        objectId: sku.id,
        source: 'api',
        newValues: { channel: input.channel, title: row.title },
      });
      return toChannelContentView(row, sku.name);
    });
  }

  async listChannelContent(skuId: string, ctx: RequestContext): Promise<ChannelContentView[]> {
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, tenantId: ctx.tenantId } });
    if (!sku) throw notFound('Sku', skuId);
    const rows = await this.prisma.skuChannelContent.findMany({
      where: { tenantId: ctx.tenantId, skuId: sku.id },
      orderBy: { channel: 'asc' },
    });
    return rows.map((row) => toChannelContentView(row, sku.name));
  }

  /** Readiness: active SKUs still missing content for a channel. */
  async channelReadiness(
    channel: string,
    ctx: RequestContext,
  ): Promise<{ channel: string; total: number; withContent: number; missing: string[] }> {
    if (!CHANNEL_RE.test(channel)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid channel code');
    }
    const [skus, rows] = await Promise.all([
      this.prisma.sku.findMany({
        where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
        select: { id: true, code: true },
        take: 500,
      }),
      this.prisma.skuChannelContent.findMany({
        where: { tenantId: ctx.tenantId, channel },
        select: { skuId: true },
      }),
    ]);
    const covered = new Set(rows.map((r) => r.skuId));
    const missing = skus.filter((s) => !covered.has(s.id)).map((s) => s.code);
    return { channel, total: skus.length, withContent: skus.length - missing.length, missing };
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

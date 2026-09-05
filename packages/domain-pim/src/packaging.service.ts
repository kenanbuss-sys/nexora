import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Packaging hierarchy (PIM): pack levels above the base unit — a box of
 * 12, a pallet of 480 — each optionally carrying its own scannable
 * barcode. Scanning a pack barcode resolves to the SKU together with
 * the base-unit multiplier, so warehouse receipts can be booked per
 * pack without arithmetic at the scanner.
 */

export interface PackagingLevelView {
  id: string;
  skuId: string;
  name: string;
  unitsPerPack: string;
  barcodeValue: string | null;
}

export interface PackResolution {
  skuId: string;
  skuCode: string;
  skuName: string;
  packName: string;
  unitsPerPack: string;
}

export class PackagingService {
  constructor(private readonly prisma: PrismaClient) {}

  async listLevels(skuId: string, ctx: RequestContext): Promise<PackagingLevelView[]> {
    const levels = await this.prisma.packagingLevel.findMany({
      where: { tenantId: ctx.tenantId, skuId },
      orderBy: { unitsPerPack: 'asc' },
    });
    return levels.map((l) => ({
      id: l.id,
      skuId: l.skuId,
      name: l.name,
      unitsPerPack: l.unitsPerPack.toString(),
      barcodeValue: l.barcodeValue,
    }));
  }

  async addLevel(
    input: {
      skuId: string;
      name: string;
      unitsPerPack: number;
      barcodeValue?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<PackagingLevelView> {
    if (!(input.unitsPerPack > 1)) {
      throw new DomainError('VALIDATION_FAILED', 'A pack must hold more than one base unit');
    }
    const name = input.name.trim();
    if (!name) throw new DomainError('VALIDATION_FAILED', 'Pack name is required');
    const sku = await this.prisma.sku.findFirst({
      where: { id: input.skuId, tenantId: ctx.tenantId },
    });
    if (!sku) throw notFound('Sku', input.skuId);
    const barcodeValue = input.barcodeValue?.trim() || null;
    if (barcodeValue) {
      // Pack barcodes share the scan namespace with unit barcodes.
      const clash = await this.prisma.barcode.findUnique({
        where: { tenantId_value: { tenantId: ctx.tenantId, value: barcodeValue } },
      });
      if (clash) {
        throw new DomainError('CONFLICT', 'This barcode already identifies a unit SKU');
      }
    }
    try {
      const level = await this.prisma.$transaction(async (tx) => {
        const created = await tx.packagingLevel.create({
          data: {
            tenantId: ctx.tenantId,
            skuId: sku.id,
            name,
            unitsPerPack: input.unitsPerPack,
            barcodeValue,
          },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'pim.packaging.add',
          objectType: 'PackagingLevel',
          objectId: created.id,
          source: 'api',
          newValues: { skuId: sku.id, name, unitsPerPack: input.unitsPerPack },
        });
        return created;
      });
      return {
        id: level.id,
        skuId: level.skuId,
        name: level.name,
        unitsPerPack: level.unitsPerPack.toString(),
        barcodeValue: level.barcodeValue,
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', 'This pack name or barcode is already taken');
      }
      throw error;
    }
  }

  async removeLevel(levelId: string, ctx: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.packagingLevel.findFirst({
        where: { id: levelId, tenantId: ctx.tenantId },
      });
      if (!existing) throw notFound('PackagingLevel', levelId);
      await tx.packagingLevel.delete({ where: { id: existing.id } });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'pim.packaging.remove',
        objectType: 'PackagingLevel',
        objectId: existing.id,
        source: 'api',
        previousValues: { skuId: existing.skuId, name: existing.name },
      });
    });
  }

  /** Resolves a pack barcode to its SKU and multiplier; null when unknown. */
  async resolvePackBarcode(value: string, ctx: RequestContext): Promise<PackResolution | null> {
    const level = await this.prisma.packagingLevel.findUnique({
      where: { tenantId_barcodeValue: { tenantId: ctx.tenantId, barcodeValue: value.trim() } },
      include: { sku: true },
    });
    if (!level) return null;
    return {
      skuId: level.skuId,
      skuCode: level.sku.code,
      skuName: level.sku.name,
      packName: level.name,
      unitsPerPack: level.unitsPerPack.toString(),
    };
  }
}

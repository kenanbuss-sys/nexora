import type { PrismaClient } from '@nexora/db';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Data quality rules (MDM): a computed report over master data — no
 * stored state, always the live truth. Each check returns its count and
 * a small sample so stewards can jump straight to the offenders.
 */

export interface QualityCheck {
  key: string;
  label: string;
  count: number;
  samples: string[];
}

export interface QualityReport {
  checks: QualityCheck[];
  totalIssues: number;
}

const SAMPLE = 5;

export class DataQualityService {
  constructor(private readonly prisma: PrismaClient) {}

  async report(ctx: RequestContext): Promise<QualityReport> {
    const tenantId = ctx.tenantId;
    const checks: QualityCheck[] = [];

    // Parties without a contact e-mail.
    const partiesNoEmail = await this.prisma.party.findMany({
      where: { tenantId, status: 'ACTIVE', OR: [{ email: null }, { email: '' }] },
      select: { name: true },
      take: 1000,
    });
    checks.push({
      key: 'party.missing_email',
      label: 'Active parties without an e-mail',
      count: partiesNoEmail.length,
      samples: partiesNoEmail.slice(0, SAMPLE).map((p) => p.name),
    });

    // Possible duplicate parties (same normalized name).
    const duplicateGroups = await this.prisma.party.groupBy({
      by: ['normalizedName'],
      where: { tenantId, status: 'ACTIVE' },
      having: { normalizedName: { _count: { gt: 1 } } },
      _count: { _all: true },
    });
    checks.push({
      key: 'party.duplicates',
      label: 'Possible duplicate parties (same name)',
      count: duplicateGroups.length,
      samples: duplicateGroups.slice(0, SAMPLE).map((g) => g.normalizedName),
    });

    // Customer accounts without a territory.
    const noTerritory = await this.prisma.crmAccount.findMany({
      where: { tenantId, status: 'ACTIVE', territoryId: null },
      select: { accountNumber: true },
      take: 1000,
    });
    checks.push({
      key: 'account.no_territory',
      label: 'Customer accounts without a territory',
      count: noTerritory.length,
      samples: noTerritory.slice(0, SAMPLE).map((a) => a.accountNumber),
    });

    // Active SKUs without any barcode.
    const skusNoBarcode = await this.prisma.sku.findMany({
      where: { tenantId, status: 'ACTIVE', barcodes: { none: {} } },
      select: { code: true },
      take: 1000,
    });
    checks.push({
      key: 'sku.no_barcode',
      label: 'Active SKUs without a barcode',
      count: skusNoBarcode.length,
      samples: skusNoBarcode.slice(0, SAMPLE).map((s) => s.code),
    });

    // Products without any SKU.
    const productsNoSku = await this.prisma.product.findMany({
      where: { tenantId, skus: { none: {} } },
      select: { code: true },
      take: 1000,
    });
    checks.push({
      key: 'product.no_sku',
      label: 'Products without a SKU',
      count: productsNoSku.length,
      samples: productsNoSku.slice(0, SAMPLE).map((p) => p.code),
    });

    // Suppliers without a lead time (planning cannot schedule them).
    const suppliersNoLeadTime = await this.prisma.supplier.findMany({
      where: { tenantId, status: 'ACTIVE', leadTimeDays: null },
      select: { supplierNumber: true },
      take: 1000,
    });
    checks.push({
      key: 'supplier.no_lead_time',
      label: 'Active suppliers without a lead time',
      count: suppliersNoLeadTime.length,
      samples: suppliersNoLeadTime.slice(0, SAMPLE).map((s) => s.supplierNumber),
    });

    return {
      checks,
      totalIssues: checks.reduce((sum, c) => sum + c.count, 0),
    };
  }
}

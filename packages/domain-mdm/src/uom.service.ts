import type { PrismaClient } from '@nexora/db';
import { DomainError } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * UOM master (MDM-004). The tenant's catalog of valid units of
 * measure: a curated default set plus tenant additions from versioned
 * configuration (mdm.uoms). Every SKU base unit and every conversion
 * must name a unit from this catalog, so unit codes cannot drift into
 * free-text chaos across domains.
 */

export interface UomView {
  code: string;
  name: string;
  custom: boolean;
}

/** Cross-domain contract: effective configuration is owned by CORE. */
export interface UomConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ version: number; config: unknown }>;
}

export const DEFAULT_UOMS: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'pcs', name: 'Pieces' },
  { code: 'kg', name: 'Kilogram' },
  { code: 'g', name: 'Gram' },
  { code: 'l', name: 'Litre' },
  { code: 'ml', name: 'Millilitre' },
  { code: 'm', name: 'Metre' },
  { code: 'cm', name: 'Centimetre' },
  { code: 'm2', name: 'Square metre' },
  { code: 'box', name: 'Box' },
  { code: 'pallet', name: 'Pallet' },
  { code: 'pair', name: 'Pair' },
  { code: 'set', name: 'Set' },
  { code: 'day', name: 'Day' },
  { code: 'h', name: 'Hour' },
];

const UOM_CODE_RE = /^[a-z0-9]{1,10}$/;

export class UomService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: UomConfigGate,
  ) {}

  private async customUoms(tenantId: string): Promise<Array<{ code: string; name: string }>> {
    try {
      const { config } = await this.config.getEffectiveConfiguration(tenantId);
      const raw = (config as { mdm?: { uoms?: unknown } })?.mdm?.uoms;
      if (!Array.isArray(raw)) return [];
      const out: Array<{ code: string; name: string }> = [];
      for (const entry of raw) {
        const code = (entry as { code?: unknown })?.code;
        const name = (entry as { name?: unknown })?.name;
        if (typeof code === 'string' && UOM_CODE_RE.test(code)) {
          out.push({ code, name: typeof name === 'string' && name ? name : code });
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  async listUoms(ctx: RequestContext): Promise<UomView[]> {
    const custom = await this.customUoms(ctx.tenantId);
    const seen = new Set<string>();
    const out: UomView[] = [];
    for (const u of DEFAULT_UOMS) {
      seen.add(u.code);
      out.push({ ...u, custom: false });
    }
    for (const u of custom) {
      if (seen.has(u.code)) continue;
      seen.add(u.code);
      out.push({ ...u, custom: true });
    }
    return out;
  }

  /** Refuses unit codes that are not in this tenant's UOM catalog. */
  async assertValid(tenantId: string, code: string): Promise<void> {
    if (DEFAULT_UOMS.some((u) => u.code === code)) return;
    const custom = await this.customUoms(tenantId);
    if (custom.some((u) => u.code === code)) return;
    throw new DomainError(
      'VALIDATION_FAILED',
      `Unknown unit of measure '${code}' — add it to the UOM master first`,
    );
  }

  /** How widely a unit is in use (informational, for stewards). */
  async usage(code: string, ctx: RequestContext): Promise<{ skus: number; conversions: number }> {
    const [skus, conversions] = await Promise.all([
      this.prisma.sku.count({ where: { tenantId: ctx.tenantId, baseUom: code } }),
      this.prisma.uomConversion.count({
        where: { tenantId: ctx.tenantId, OR: [{ fromUom: code }, { toUom: code }] },
      }),
    ]);
    return { skus, conversions };
  }
}

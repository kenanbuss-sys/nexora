import { DomainError } from '@nexora/kernel';

/**
 * Made-to-measure pricing (CPQ, Sprint 247). Products sold by area (m²),
 * length (m1) or piece, with a minimum billable size per piece, percentage
 * and fixed surcharges, installation priced per piece or per billable unit,
 * and a discount by customer price tier. Generic: blinds, awnings, shades,
 * fly screens, glass, boards cut to size, …
 *
 * Configuration (versioned tenant configuration `cpq.madeToMeasure`):
 *   products:    [{ skuCode, basis: AREA|LENGTH|PIECE, minBillable?, maxWidthMm?, maxHeightMm? }]
 *   surcharges:  [{ code, label, type: PERCENT|PER_PIECE|PER_UNIT, value, installation?, skuCodes? }]
 *   tierDiscounts: { <tier>: <percent> }
 *   discountInstallation: boolean (default false — installation is not discounted)
 * The computed breakdown is SNAPSHOT on the quote line, so later price or
 * configuration changes never alter an issued quote.
 */

export type MeasureBasis = 'AREA' | 'LENGTH' | 'PIECE';
export type SurchargeType = 'PERCENT' | 'PER_PIECE' | 'PER_UNIT';

export interface MeasuredProductRule {
  skuCode: string;
  basis: MeasureBasis;
  /** Minimum billable m² (AREA) or m1 (LENGTH) PER PIECE. */
  minBillable: number;
  maxWidthMm: number | null;
  maxHeightMm: number | null;
}

export interface SurchargeRule {
  code: string;
  label: string;
  type: SurchargeType;
  value: number;
  installation: boolean;
  /** Empty = applies to every made-to-measure product. */
  skuCodes: string[];
}

export interface MadeToMeasureConfig {
  products: Map<string, MeasuredProductRule>;
  surcharges: Map<string, SurchargeRule>;
  tierDiscounts: Map<string, number>;
  discountInstallation: boolean;
}

const CODE_RE = /^[A-Za-z0-9._-]{1,40}$/;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Parses tenant configuration; invalid entries are skipped, never guessed. */
export function parseMadeToMeasure(raw: unknown): MadeToMeasureConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const products = new Map<string, MeasuredProductRule>();
  for (const entry of Array.isArray(r.products) ? r.products : []) {
    const p = entry as Record<string, unknown>;
    const basis = p.basis;
    if (typeof p.skuCode !== 'string' || !['AREA', 'LENGTH', 'PIECE'].includes(String(basis))) {
      continue;
    }
    const min = num(p.minBillable);
    products.set(p.skuCode, {
      skuCode: p.skuCode,
      basis: basis as MeasureBasis,
      minBillable: min !== null && min >= 0 ? min : 0,
      maxWidthMm: num(p.maxWidthMm),
      maxHeightMm: num(p.maxHeightMm),
    });
  }
  const surcharges = new Map<string, SurchargeRule>();
  for (const entry of Array.isArray(r.surcharges) ? r.surcharges : []) {
    const s = entry as Record<string, unknown>;
    const value = num(s.value);
    if (
      typeof s.code !== 'string' ||
      !CODE_RE.test(s.code) ||
      !['PERCENT', 'PER_PIECE', 'PER_UNIT'].includes(String(s.type)) ||
      value === null ||
      value < 0
    ) {
      continue;
    }
    surcharges.set(s.code, {
      code: s.code,
      label: typeof s.label === 'string' && s.label ? s.label : s.code,
      type: s.type as SurchargeType,
      value,
      installation: s.installation === true,
      skuCodes: Array.isArray(s.skuCodes)
        ? s.skuCodes.filter((c): c is string => typeof c === 'string')
        : [],
    });
  }
  const tierDiscounts = new Map<string, number>();
  const tiers = (r.tierDiscounts ?? {}) as Record<string, unknown>;
  for (const [tier, pct] of Object.entries(tiers)) {
    const v = num(pct);
    if (CODE_RE.test(tier) && v !== null && v >= 0 && v <= 100) tierDiscounts.set(tier, v);
  }
  return {
    products,
    surcharges,
    tierDiscounts,
    discountInstallation: r.discountInstallation === true,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Billable quantities round UP to the next 0.01 (never under-bill). */
const ceil2 = (n: number) => Math.ceil(n * 100 - 1e-9) / 100;

export interface MeasuredInput {
  widthMm: number;
  heightMm?: number | undefined;
  pieces: number;
  surchargeCodes: string[];
}

export interface MeasuredBreakdown {
  basis: MeasureBasis;
  widthMm: number;
  heightMm: number | null;
  pieces: number;
  /** Actual m² / m1 per piece before the minimum. */
  measuredPerPiece: number;
  billablePerPiece: number;
  billableQuantity: number;
  unit: 'm2' | 'm1' | 'pcs';
  unitPrice: number;
  base: number;
  surcharges: Array<{
    code: string;
    label: string;
    type: SurchargeType;
    value: number;
    amount: number;
  }>;
  installation: Array<{
    code: string;
    label: string;
    type: SurchargeType;
    value: number;
    amount: number;
  }>;
  goodsGross: number;
  installationGross: number;
  discountPct: number;
  discountSource: 'EXPLICIT' | 'RULE' | 'TIER' | 'NONE';
  goodsNet: number;
  installationNet: number;
  total: number;
}

/** Pure computation — validated input, deterministic rounding. */
export function computeMeasured(
  rule: MeasuredProductRule,
  config: MadeToMeasureConfig,
  input: MeasuredInput,
  unitPrice: number,
  discount: { pct: number; source: MeasuredBreakdown['discountSource'] },
): MeasuredBreakdown {
  if (!Number.isInteger(input.pieces) || input.pieces < 1 || input.pieces > 10_000) {
    throw new DomainError('VALIDATION_FAILED', 'Pieces must be a whole number 1-10000');
  }
  if (!(input.widthMm > 0) || input.widthMm > 100_000) {
    throw new DomainError('VALIDATION_FAILED', 'Width must be 1-100000 mm');
  }
  const needsHeight = rule.basis === 'AREA';
  const height = input.heightMm ?? null;
  if (needsHeight && !(height !== null && height > 0 && height <= 100_000)) {
    throw new DomainError('VALIDATION_FAILED', 'Height (mm) is required for area pricing');
  }
  if (rule.maxWidthMm !== null && input.widthMm > rule.maxWidthMm) {
    throw new DomainError('VALIDATION_FAILED', `Width exceeds the maximum ${rule.maxWidthMm} mm`);
  }
  if (rule.maxHeightMm !== null && height !== null && height > rule.maxHeightMm) {
    throw new DomainError('VALIDATION_FAILED', `Height exceeds the maximum ${rule.maxHeightMm} mm`);
  }
  const measured =
    rule.basis === 'AREA'
      ? (input.widthMm * (height as number)) / 1_000_000
      : rule.basis === 'LENGTH'
        ? input.widthMm / 1000
        : 1;
  const billablePerPiece = rule.basis === 'PIECE' ? 1 : ceil2(Math.max(measured, rule.minBillable));
  const billableQuantity = round2(billablePerPiece * input.pieces);
  const base = round2(billableQuantity * unitPrice);

  const codes = [...new Set(input.surchargeCodes)];
  const surcharges: MeasuredBreakdown['surcharges'] = [];
  const installation: MeasuredBreakdown['installation'] = [];
  for (const code of codes) {
    const s = config.surcharges.get(code);
    if (!s) throw new DomainError('VALIDATION_FAILED', `Unknown surcharge ${code}`);
    if (s.skuCodes.length > 0 && !s.skuCodes.includes(rule.skuCode)) {
      throw new DomainError('VALIDATION_FAILED', `${s.label} does not apply to ${rule.skuCode}`);
    }
    const amount = round2(
      s.type === 'PERCENT'
        ? (base * s.value) / 100
        : s.type === 'PER_PIECE'
          ? s.value * input.pieces
          : s.value * billableQuantity,
    );
    const entry = { code: s.code, label: s.label, type: s.type, value: s.value, amount };
    (s.installation ? installation : surcharges).push(entry);
  }
  const goodsGross = round2(base + surcharges.reduce((sum, s) => sum + s.amount, 0));
  const installationGross = round2(installation.reduce((sum, s) => sum + s.amount, 0));
  const pct = discount.pct;
  const goodsNet = round2(goodsGross * (1 - pct / 100));
  const installationNet = config.discountInstallation
    ? round2(installationGross * (1 - pct / 100))
    : installationGross;
  return {
    basis: rule.basis,
    widthMm: input.widthMm,
    heightMm: height,
    pieces: input.pieces,
    measuredPerPiece: Math.round(measured * 10000) / 10000,
    billablePerPiece,
    billableQuantity,
    unit: rule.basis === 'AREA' ? 'm2' : rule.basis === 'LENGTH' ? 'm1' : 'pcs',
    unitPrice,
    base,
    surcharges,
    installation,
    goodsGross,
    installationGross,
    discountPct: pct,
    discountSource: discount.source,
    goodsNet,
    installationNet,
    total: round2(goodsNet + installationNet),
  };
}

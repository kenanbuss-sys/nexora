import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * ESG — sustainability (ESG-001..010). Energy, waste and emission
 * data ride the audit ledger with idempotency markers; KPI
 * definitions, targets, emission factors, material and supplier
 * attributes are tenant configuration; compliance evidence is a
 * governed custom-object register; reports export through
 * provider-neutral connectors, exactly once per period.
 */

const PERIOD_RE = /^\d{4}-\d{2}$/;
const KEY_RE = /^[A-Za-z0-9._:-]{1,64}$/;

const EVIDENCE_OBJECT = {
  key: 'esg_evidence',
  name: 'Dokaz usklađenosti',
  fields: [
    { key: 'naziv', label: 'Naziv', type: 'text', required: true },
    {
      key: 'vrsta',
      label: 'Vrsta',
      type: 'select',
      required: true,
      options: ['certifikat', 'izvjestaj', 'dozvola', 'ostalo'],
    },
    { key: 'vrijedi_do', label: 'Vrijedi do', type: 'date', required: false },
  ],
};

/** Cross-domain contract: tenant configuration (owned by core). */
export interface EsgConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
}

/** Cross-domain contract: governed custom objects (owned by core). */
export interface EsgObjectGate {
  defineObject(
    input: { key: string; name: string; fields: unknown },
    ctx: RequestContext,
  ): Promise<unknown>;
  listRecords(
    key: string,
    ctx: RequestContext,
  ): Promise<Array<{ id: string; data: unknown; createdAt: string }>>;
}

/** Cross-domain contract: connector push (owned by INT). */
export interface EsgConnectorGate {
  pushObject(
    input: { key: string; objectType: string; objectId: string; payload: Record<string, unknown> },
    ctx: RequestContext,
  ): Promise<{ ok: boolean; reference: string }>;
}

export interface EsgKpi {
  key: string;
  name: string;
  unit: string;
  target: number | null;
}

export class EsgService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration: EsgConfigGate,
    private readonly objects?: EsgObjectGate,
    private readonly connectors?: EsgConnectorGate,
  ) {}

  private async config(tenantId: string): Promise<Record<string, unknown>> {
    const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
    return ((config as Record<string, unknown>).esg ?? {}) as Record<string, unknown>;
  }

  private async marked(action: string, objectId: string, tenantId: string) {
    return this.prisma.auditEvent.findFirst({
      where: { tenantId, action, objectType: 'Esg', objectId },
      orderBy: { occurredAt: 'desc' },
    });
  }

  private async mark(
    action: string,
    objectId: string,
    newValues: Record<string, unknown>,
    ctx: RequestContext,
  ) {
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action,
      objectType: 'Esg',
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
    });
  }

  // ------------------------------------------- energy & waste (ESG-001/002)

  /** One energy reading per facility, period and source. Idempotent. */
  async recordEnergy(
    input: { facility: string; period: string; source: string; kwh: number },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    if (!PERIOD_RE.test(input.period)) {
      throw new DomainError('VALIDATION_FAILED', 'Period must be YYYY-MM');
    }
    if (!KEY_RE.test(input.facility) || !KEY_RE.test(input.source)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid facility or source key');
    }
    if (!Number.isFinite(input.kwh) || input.kwh < 0) {
      throw new DomainError('VALIDATION_FAILED', 'kWh must not be negative');
    }
    const objectId = `energy:${input.facility}:${input.period}:${input.source}`;
    if (await this.marked('esg.energy', objectId, ctx.tenantId)) {
      return { ok: true, duplicate: true };
    }
    await this.mark(
      'esg.energy',
      objectId,
      { facility: input.facility, period: input.period, source: input.source, kwh: input.kwh },
      ctx,
    );
    return { ok: true, duplicate: false };
  }

  /** One waste entry per facility, period and kind. Idempotent. */
  async recordWaste(
    input: { facility: string; period: string; kind: string; kg: number; disposal: string },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    if (!PERIOD_RE.test(input.period)) {
      throw new DomainError('VALIDATION_FAILED', 'Period must be YYYY-MM');
    }
    if (!KEY_RE.test(input.facility) || !KEY_RE.test(input.kind)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid facility or kind key');
    }
    if (!Number.isFinite(input.kg) || input.kg < 0) {
      throw new DomainError('VALIDATION_FAILED', 'kg must not be negative');
    }
    if (!['recikliranje', 'deponija', 'spaljivanje', 'povrat'].includes(input.disposal)) {
      throw new DomainError('VALIDATION_FAILED', `Unknown disposal '${input.disposal}'`);
    }
    const objectId = `waste:${input.facility}:${input.period}:${input.kind}`;
    if (await this.marked('esg.waste', objectId, ctx.tenantId)) {
      return { ok: true, duplicate: true };
    }
    await this.mark(
      'esg.waste',
      objectId,
      {
        facility: input.facility,
        period: input.period,
        kind: input.kind,
        kg: input.kg,
        disposal: input.disposal,
      },
      ctx,
    );
    return { ok: true, duplicate: false };
  }

  // --------------------------------------- material attributes (ESG-003)

  /** Material sustainability attributes from config, joined to SKUs. */
  async materials(
    ctx: RequestContext,
  ): Promise<Array<{ skuCode: string; known: boolean; recycledPct: number; hazardous: boolean }>> {
    const esg = await this.config(ctx.tenantId);
    const raw = Array.isArray(esg.materials) ? esg.materials : [];
    const attributes = new Map<string, { recycledPct: number; hazardous: boolean }>();
    for (const entry of raw) {
      const m = entry as Record<string, unknown>;
      if (typeof m.skuCode !== 'string') continue;
      attributes.set(m.skuCode, {
        recycledPct: Number(m.recycledPct) || 0,
        hazardous: m.hazardous === true,
      });
    }
    const skus = await this.prisma.sku.findMany({
      where: { tenantId: ctx.tenantId },
      select: { code: true },
      take: 500,
    });
    return skus.map((sku) => {
      const attr = attributes.get(sku.code);
      return {
        skuCode: sku.code,
        known: attr !== undefined,
        recycledPct: attr?.recycledPct ?? 0,
        hazardous: attr?.hazardous ?? false,
      };
    });
  }

  // ------------------------------------------- KPIs & targets (ESG-004/008)

  async kpis(ctx: RequestContext): Promise<EsgKpi[]> {
    const esg = await this.config(ctx.tenantId);
    const raw = Array.isArray(esg.kpis) ? esg.kpis : [];
    return raw
      .map((entry) => entry as Record<string, unknown>)
      .filter((k) => typeof k.key === 'string')
      .map((k) => ({
        key: k.key as string,
        name: typeof k.name === 'string' ? k.name : (k.key as string),
        unit: typeof k.unit === 'string' ? k.unit : '',
        target:
          Number.isFinite(Number(k.target)) && k.target !== undefined ? Number(k.target) : null,
      }));
  }

  /** KPI progress for a period: measured energy/waste/emissions vs targets. */
  async targets(
    period: string,
    ctx: RequestContext,
  ): Promise<Array<{ key: string; target: number | null; actual: number; met: boolean | null }>> {
    if (!PERIOD_RE.test(period)) {
      throw new DomainError('VALIDATION_FAILED', 'Period must be YYYY-MM');
    }
    const kpis = await this.kpis(ctx);
    const summary = await this.periodSummary(period, ctx.tenantId);
    const actuals: Record<string, number> = {
      'energy-kwh': summary.energyKwh,
      'waste-kg': summary.wasteKg,
      'co2-kg': (await this.emissions(period, ctx)).totalKgCo2,
      'recycling-pct': summary.recyclingPct,
    };
    return kpis.map((kpi) => {
      const actual = actuals[kpi.key] ?? 0;
      // For recycling the target is a floor; for the rest it is a cap.
      const met =
        kpi.target === null
          ? null
          : kpi.key === 'recycling-pct'
            ? actual >= kpi.target
            : actual <= kpi.target;
      return { key: kpi.key, target: kpi.target, actual: Number(actual.toFixed(2)), met };
    });
  }

  private async periodSummary(period: string, tenantId: string) {
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId,
        action: { in: ['esg.energy', 'esg.waste'] },
        objectType: 'Esg',
      },
      take: 5000,
    });
    let energyKwh = 0;
    let wasteKg = 0;
    let recycledKg = 0;
    const energyBySource = new Map<string, number>();
    for (const event of events) {
      const values = (event.newValues ?? {}) as Record<string, unknown>;
      if (values.period !== period) continue;
      if (event.action === 'esg.energy') {
        const kwh = Number(values.kwh) || 0;
        energyKwh += kwh;
        const source = String(values.source ?? '');
        energyBySource.set(source, (energyBySource.get(source) ?? 0) + kwh);
      } else {
        const kg = Number(values.kg) || 0;
        wasteKg += kg;
        if (values.disposal === 'recikliranje' || values.disposal === 'povrat') recycledKg += kg;
      }
    }
    return {
      energyKwh,
      wasteKg,
      recycledKg,
      recyclingPct: wasteKg > 0 ? (recycledKg / wasteKg) * 100 : 0,
      energyBySource,
    };
  }

  // ------------------------------------------------- emissions (ESG-005)

  /** CO2 from energy readings × configured emission factors (kg/kWh). */
  async emissions(
    period: string,
    ctx: RequestContext,
  ): Promise<{ period: string; totalKgCo2: number; bySource: Record<string, number> }> {
    if (!PERIOD_RE.test(period)) {
      throw new DomainError('VALIDATION_FAILED', 'Period must be YYYY-MM');
    }
    const esg = await this.config(ctx.tenantId);
    const factors = (esg.emissionFactors ?? {}) as Record<string, unknown>;
    const summary = await this.periodSummary(period, ctx.tenantId);
    const bySource: Record<string, number> = {};
    let total = 0;
    for (const [source, kwh] of summary.energyBySource) {
      const factor = Number(factors[source]) || 0;
      const kg = kwh * factor;
      bySource[source] = Number(kg.toFixed(2));
      total += kg;
    }
    return { period, totalKgCo2: Number(total.toFixed(2)), bySource };
  }

  // ------------------------------------- supplier attributes (ESG-006)

  /** Latest sustainability rating per supplier wins. Audited. */
  async rateSupplier(
    input: { supplierId: string; score: number; certification?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
      throw new DomainError('VALIDATION_FAILED', 'Score must be an integer 1-5');
    }
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: input.supplierId, tenantId: ctx.tenantId },
    });
    if (!supplier) throw notFound('Supplier', input.supplierId);
    await this.mark(
      'esg.supplier.rating',
      `supplier:${supplier.id}`,
      { score: input.score, certification: input.certification ?? null },
      ctx,
    );
    return { ok: true };
  }

  async supplierRatings(
    ctx: RequestContext,
  ): Promise<
    Array<{ supplierId: string; name: string; score: number | null; certification: string | null }>
  > {
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, supplierNumber: true },
      take: 500,
    });
    const result = [];
    for (const supplier of suppliers) {
      const latest = await this.marked(
        'esg.supplier.rating',
        `supplier:${supplier.id}`,
        ctx.tenantId,
      );
      const values = (latest?.newValues ?? null) as {
        score?: number;
        certification?: string | null;
      } | null;
      result.push({
        supplierId: supplier.id,
        name: supplier.supplierNumber,
        score: values?.score ?? null,
        certification: values?.certification ?? null,
      });
    }
    return result;
  }

  // -------------------------------------------------- evidence (ESG-007)

  /** Provision the compliance-evidence register. Idempotent. */
  async setup(ctx: RequestContext): Promise<{ ok: true }> {
    if (!this.objects) throw new DomainError('INVALID_STATE', 'Custom objects are not wired');
    try {
      await this.objects.defineObject(EVIDENCE_OBJECT, ctx);
    } catch (error) {
      if (!(error instanceof DomainError && error.code === 'CONFLICT')) throw error;
    }
    return { ok: true };
  }

  async evidence(
    ctx: RequestContext,
  ): Promise<
    Array<{ id: string; name: string; kind: string; validUntil: string | null; expired: boolean }>
  > {
    if (!this.objects) throw new DomainError('INVALID_STATE', 'Custom objects are not wired');
    const records = await this.objects.listRecords(EVIDENCE_OBJECT.key, ctx);
    const today = new Date().toISOString().slice(0, 10);
    return records.map((record) => {
      const data = (record.data ?? {}) as Record<string, unknown>;
      const validUntil = typeof data.vrijedi_do === 'string' ? data.vrijedi_do : null;
      return {
        id: record.id,
        name: String(data.naziv ?? ''),
        kind: String(data.vrsta ?? ''),
        validUntil,
        expired: validUntil !== null && validUntil < today,
      };
    });
  }

  // -------------------------------------- reporting & analytics (ESG-009/010)

  /** Push the period's ESG report through a connector. Exactly once. */
  async exportReport(
    input: { connectorKey: string; period: string },
    ctx: RequestContext,
  ): Promise<{ reference: string; existing: boolean }> {
    if (!this.connectors) throw new DomainError('INVALID_STATE', 'Connectors are not wired');
    if (!PERIOD_RE.test(input.period)) {
      throw new DomainError('VALIDATION_FAILED', 'Period must be YYYY-MM');
    }
    const marker = `report:${input.connectorKey}:${input.period}`;
    const already = await this.marked('esg.report.export', marker, ctx.tenantId);
    if (already) {
      return {
        reference: (already.newValues as { reference?: string } | null)?.reference ?? '',
        existing: true,
      };
    }
    const analytics = await this.analytics(input.period, ctx);
    const result = await this.connectors.pushObject(
      {
        key: input.connectorKey,
        objectType: 'esg_report',
        objectId: input.period,
        payload: { ...analytics },
      },
      ctx,
    );
    if (!result.ok) {
      throw new DomainError('INVALID_STATE', 'The reporting endpoint refused the export');
    }
    await this.mark('esg.report.export', marker, { reference: result.reference }, ctx);
    return { reference: result.reference, existing: false };
  }

  /** Operational sustainability analytics for one period. */
  async analytics(
    period: string,
    ctx: RequestContext,
  ): Promise<{
    period: string;
    energyKwh: number;
    wasteKg: number;
    recyclingPct: number;
    totalKgCo2: number;
  }> {
    if (!PERIOD_RE.test(period)) {
      throw new DomainError('VALIDATION_FAILED', 'Period must be YYYY-MM');
    }
    const summary = await this.periodSummary(period, ctx.tenantId);
    const co2 = await this.emissions(period, ctx);
    return {
      period,
      energyKwh: Number(summary.energyKwh.toFixed(2)),
      wasteKg: Number(summary.wasteKg.toFixed(2)),
      recyclingPct: Number(summary.recyclingPct.toFixed(1)),
      totalKgCo2: co2.totalKgCo2,
    };
  }
}

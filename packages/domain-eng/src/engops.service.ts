import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Engineering operations (ENG-004/005/009/010/012/014/015): parametric
 * BOM resolution from structured configuration rules, BOM component
 * alternates, a drawing register, CAD/PDM export through connectors,
 * work instructions and tooling per routing operation, and compliance
 * specifications per SKU. Everything is configuration or audited
 * data — released BOMs and routings stay immutable.
 */

const KEY_RE = /^[A-Za-z0-9._:-]{1,64}$/;

/** Cross-domain contract: tenant configuration (owned by core). */
export interface EngOpsConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
}

/** Cross-domain contract: connector push (owned by INT). */
export interface EngOpsConnectorGate {
  pushObject(
    input: { key: string; objectType: string; objectId: string; payload: Record<string, unknown> },
    ctx: RequestContext,
  ): Promise<{ ok: boolean; reference: string }>;
}

export class EngOpsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration: EngOpsConfigGate,
    private readonly connectors?: EngOpsConnectorGate,
  ) {}

  private async engConfig(tenantId: string): Promise<Record<string, unknown>> {
    const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
    return ((config as Record<string, unknown>).eng ?? {}) as Record<string, unknown>;
  }

  private async sku(code: string, ctx: RequestContext) {
    const sku = await this.prisma.sku.findFirst({
      where: { code, tenantId: ctx.tenantId },
    });
    if (!sku) throw notFound('Sku', code);
    return sku;
  }

  private async marked(action: string, objectId: string, tenantId: string) {
    return this.prisma.auditEvent.findFirst({
      where: { tenantId, action, objectType: 'Engineering', objectId },
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
      objectType: 'Engineering',
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
    });
  }

  // ------------------------------------------------ parametric BOM (ENG-004)

  /**
   * Resolve a parametric BOM: structured rules per SKU
   * (`eng.parametric`: { [skuCode]: [{ component, base, factor,
   * parameter }] }) — line qty = base + factor × parameter value. No
   * expression evaluation, only declared arithmetic.
   */
  async resolveParametric(
    input: { skuCode: string; parameters: Record<string, number> },
    ctx: RequestContext,
  ): Promise<{ skuCode: string; lines: Array<{ component: string; quantity: number }> }> {
    const eng = await this.engConfig(ctx.tenantId);
    const parametric = (eng.parametric ?? {}) as Record<string, unknown>;
    const rules = Array.isArray(parametric[input.skuCode])
      ? (parametric[input.skuCode] as unknown[])
      : null;
    if (!rules) throw notFound('ParametricBom', input.skuCode);
    const lines = [];
    for (const entry of rules) {
      const rule = entry as Record<string, unknown>;
      if (typeof rule.component !== 'string') continue;
      const base = Number(rule.base) || 0;
      const factor = Number(rule.factor) || 0;
      const parameter = typeof rule.parameter === 'string' ? rule.parameter : null;
      let value = 0;
      if (parameter !== null) {
        value = Number(input.parameters[parameter]);
        if (!Number.isFinite(value)) {
          throw new DomainError('VALIDATION_FAILED', `Parameter '${parameter}' is required`);
        }
      }
      const quantity = base + factor * value;
      if (quantity < 0) {
        throw new DomainError(
          'INVALID_STATE',
          `Computed quantity for '${rule.component}' is negative`,
        );
      }
      lines.push({ component: rule.component, quantity: Number(quantity.toFixed(6)) });
    }
    await this.mark(
      'eng.parametric.resolve',
      `parametric:${input.skuCode}`,
      { parameters: input.parameters, lines },
      ctx,
    );
    return { skuCode: input.skuCode, lines };
  }

  // ---------------------------------------------- BOM alternates (ENG-005)

  /**
   * Component alternates from `eng.alternates`:
   * [{ component, alternates: [codes] }] — every code must be a real
   * SKU of the tenant, so a bad configuration is visible.
   */
  async alternates(
    ctx: RequestContext,
  ): Promise<Array<{ component: string; alternates: string[]; unknown: string[] }>> {
    const eng = await this.engConfig(ctx.tenantId);
    const raw = Array.isArray(eng.alternates) ? eng.alternates : [];
    const allCodes = new Set(
      (
        await this.prisma.sku.findMany({
          where: { tenantId: ctx.tenantId },
          select: { code: true },
          take: 2000,
        })
      ).map((s) => s.code),
    );
    return raw
      .map((entry) => entry as Record<string, unknown>)
      .filter((a) => typeof a.component === 'string' && Array.isArray(a.alternates))
      .map((a) => {
        const codes = (a.alternates as unknown[]).filter((c): c is string => typeof c === 'string');
        return {
          component: a.component as string,
          alternates: codes.filter((c) => allCodes.has(c)),
          unknown: codes.filter((c) => !allCodes.has(c)),
        };
      });
  }

  // ------------------------------------------------ drawing register (ENG-009)

  /** Register a technical drawing revision for a SKU. Latest wins. */
  async registerDrawing(
    input: { skuCode: string; drawingNumber: string; revision: string },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    if (!KEY_RE.test(input.drawingNumber) || !KEY_RE.test(input.revision)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid drawing number or revision');
    }
    const sku = await this.sku(input.skuCode, ctx);
    await this.mark(
      'eng.drawing.register',
      `drawing:${sku.code}:${input.drawingNumber}`,
      { revision: input.revision },
      ctx,
    );
    return { ok: true };
  }

  async drawings(
    skuCode: string,
    ctx: RequestContext,
  ): Promise<Array<{ drawingNumber: string; revision: string; registeredAt: string }>> {
    const sku = await this.sku(skuCode, ctx);
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: 'eng.drawing.register',
        objectType: 'Engineering',
        objectId: { startsWith: `drawing:${sku.code}:` },
      },
      orderBy: { occurredAt: 'asc' },
      take: 500,
    });
    const latest = new Map<string, { revision: string; registeredAt: string }>();
    for (const event of events) {
      const drawingNumber = event.objectId.split(':')[2] ?? '';
      latest.set(drawingNumber, {
        revision: String((event.newValues as { revision?: unknown } | null)?.revision ?? ''),
        registeredAt: event.occurredAt.toISOString(),
      });
    }
    return [...latest.entries()].map(([drawingNumber, value]) => ({
      drawingNumber,
      ...value,
    }));
  }

  // ------------------------------------------------ CAD/PDM export (ENG-010)

  /** Push a released BOM to a PDM system. Exactly once per BOM. */
  async exportBom(
    input: { bomId: string; connectorKey: string },
    ctx: RequestContext,
  ): Promise<{ reference: string; existing: boolean }> {
    if (!this.connectors) throw new DomainError('INVALID_STATE', 'Connectors are not wired');
    const bom = await this.prisma.bom.findFirst({
      where: { id: input.bomId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!bom) throw notFound('Bom', input.bomId);
    if (bom.status !== 'RELEASED') {
      throw new DomainError('INVALID_STATE', 'Only a released BOM exports to PDM');
    }
    const marker = `pdm:${input.connectorKey}:${bom.id}`;
    const already = await this.marked('eng.pdm.export', marker, ctx.tenantId);
    if (already) {
      return {
        reference: (already.newValues as { reference?: string } | null)?.reference ?? '',
        existing: true,
      };
    }
    const result = await this.connectors.pushObject(
      {
        key: input.connectorKey,
        objectType: 'bom',
        objectId: bom.id,
        payload: {
          skuId: bom.skuId,
          version: bom.version,
          lines: bom.lines.map((line) => ({
            componentSkuId: line.componentSkuId,
            quantity: Number(line.quantity),
          })),
        },
      },
      ctx,
    );
    if (!result.ok) {
      throw new DomainError('INVALID_STATE', 'The PDM system refused the export');
    }
    await this.mark('eng.pdm.export', marker, { reference: result.reference }, ctx);
    return { reference: result.reference, existing: false };
  }

  // -------------------------------- work instructions & tooling (ENG-012/014)

  /** Attach a work instruction to a routing operation. Latest wins. */
  async setWorkInstruction(
    input: { skuCode: string; seq: number; text: string },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    if (input.text.trim().length < 5 || input.text.length > 4000) {
      throw new DomainError('VALIDATION_FAILED', 'An instruction must be 5-4000 characters');
    }
    const sku = await this.sku(input.skuCode, ctx);
    await this.mark(
      'eng.instruction.set',
      `instruction:${sku.code}:${input.seq}`,
      { text: input.text },
      ctx,
    );
    return { ok: true };
  }

  /** Declare tooling required by a routing operation. Latest wins. */
  async setTooling(
    input: { skuCode: string; seq: number; tools: string[] },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    if (input.tools.length === 0 || input.tools.length > 30) {
      throw new DomainError('VALIDATION_FAILED', 'Declare 1-30 tools');
    }
    const sku = await this.sku(input.skuCode, ctx);
    await this.mark(
      'eng.tooling.set',
      `tooling:${sku.code}:${input.seq}`,
      { tools: input.tools },
      ctx,
    );
    return { ok: true };
  }

  /** Operator sheet: routing operations + instructions + tooling. */
  async operatorSheet(
    skuCode: string,
    ctx: RequestContext,
  ): Promise<
    Array<{
      seq: number;
      name: string;
      workCenter: string;
      instruction: string | null;
      tools: string[];
    }>
  > {
    const sku = await this.sku(skuCode, ctx);
    const routing = await this.prisma.routing.findFirst({
      where: { tenantId: ctx.tenantId, skuId: sku.id, status: 'RELEASED' },
      orderBy: { version: 'desc' },
      include: { operations: { orderBy: { seq: 'asc' } } },
    });
    if (!routing) throw notFound('Routing', skuCode);
    const result = [];
    for (const op of routing.operations) {
      const instruction = await this.marked(
        'eng.instruction.set',
        `instruction:${sku.code}:${op.seq}`,
        ctx.tenantId,
      );
      const tooling = await this.marked(
        'eng.tooling.set',
        `tooling:${sku.code}:${op.seq}`,
        ctx.tenantId,
      );
      result.push({
        seq: op.seq,
        name: op.name,
        workCenter: op.workCenter,
        instruction: (instruction?.newValues as { text?: string } | null)?.text ?? null,
        tools: Array.isArray((tooling?.newValues as { tools?: unknown[] } | null)?.tools)
          ? ((tooling?.newValues as { tools: unknown[] }).tools.filter(
              (t): t is string => typeof t === 'string',
            ) as string[])
          : [],
      });
    }
    return result;
  }

  // ------------------------------------------- compliance specs (ENG-015)

  /** Compliance standards a SKU satisfies. Latest set wins. */
  async setCompliance(
    input: { skuCode: string; standards: Array<{ name: string; until?: string | undefined }> },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    if (input.standards.length > 50) {
      throw new DomainError('VALIDATION_FAILED', 'At most 50 standards');
    }
    const sku = await this.sku(input.skuCode, ctx);
    await this.mark(
      'eng.compliance.set',
      `compliance:${sku.code}`,
      { standards: input.standards },
      ctx,
    );
    return { ok: true };
  }

  /**
   * Compliance report: SKUs listed in `eng.complianceRequired`
   * ([{ skuCode, standards: [names] }]) against what is declared —
   * missing standards are gaps, not assumptions.
   */
  async complianceReport(
    ctx: RequestContext,
  ): Promise<
    Array<{ skuCode: string; required: string[]; declared: string[]; missing: string[] }>
  > {
    const eng = await this.engConfig(ctx.tenantId);
    const raw = Array.isArray(eng.complianceRequired) ? eng.complianceRequired : [];
    const result = [];
    for (const entry of raw) {
      const req = entry as Record<string, unknown>;
      if (typeof req.skuCode !== 'string' || !Array.isArray(req.standards)) continue;
      const required = (req.standards as unknown[]).filter(
        (s): s is string => typeof s === 'string',
      );
      const latest = await this.marked(
        'eng.compliance.set',
        `compliance:${req.skuCode}`,
        ctx.tenantId,
      );
      const declaredRaw = (latest?.newValues as { standards?: unknown[] } | null)?.standards ?? [];
      const declared = (declaredRaw as Array<Record<string, unknown>>)
        .map((s) => s.name)
        .filter((n): n is string => typeof n === 'string');
      result.push({
        skuCode: req.skuCode,
        required,
        declared,
        missing: required.filter((r) => !declared.includes(r)),
      });
    }
    return result;
  }
}

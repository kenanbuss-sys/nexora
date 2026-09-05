import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * SKU substitutions (PIM): governed, directed alternatives offered when
 * the primary SKU cannot be served — the Orders screen surfaces them on
 * backordered lines with live availability read through the WMS public
 * interface.
 */

export interface SubstitutionView {
  id: string;
  skuId: string;
  substituteSkuId: string;
  substituteCode: string;
  substituteName: string;
  substituteActive: boolean;
  priority: number;
  note: string | null;
}

export interface AlternativeView extends SubstitutionView {
  onHand: string;
  available: string;
}

/** Cross-domain contract: stock truth is owned by WMS. */
export interface AvailabilityGate {
  totalAvailability(
    tenantId: string,
    skuId: string,
  ): Promise<{ onHand: number; available: number }>;
}

export class SubstitutionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly availability: AvailabilityGate,
  ) {}

  private async views(
    tenantId: string,
    rows: Array<{
      id: string;
      skuId: string;
      substituteSkuId: string;
      priority: number;
      note: string | null;
    }>,
  ): Promise<SubstitutionView[]> {
    const skus = await this.prisma.sku.findMany({
      where: { tenantId, id: { in: rows.map((r) => r.substituteSkuId) } },
    });
    const byId = new Map(skus.map((s) => [s.id, s]));
    return rows.map((r) => {
      const sku = byId.get(r.substituteSkuId);
      return {
        id: r.id,
        skuId: r.skuId,
        substituteSkuId: r.substituteSkuId,
        substituteCode: sku?.code ?? '(unknown)',
        substituteName: sku?.name ?? '(unknown)',
        substituteActive: sku?.status === 'ACTIVE',
        priority: r.priority,
        note: r.note,
      };
    });
  }

  async listSubstitutions(skuId: string, ctx: RequestContext): Promise<SubstitutionView[]> {
    const rows = await this.prisma.skuSubstitution.findMany({
      where: { tenantId: ctx.tenantId, skuId },
      orderBy: { priority: 'asc' },
    });
    return this.views(ctx.tenantId, rows);
  }

  /** Substitutes with live tenant-wide availability, best priority first. */
  async listAlternatives(skuId: string, ctx: RequestContext): Promise<AlternativeView[]> {
    const substitutions = await this.listSubstitutions(skuId, ctx);
    const alternatives: AlternativeView[] = [];
    for (const substitution of substitutions) {
      if (!substitution.substituteActive) continue;
      const stock = await this.availability.totalAvailability(
        ctx.tenantId,
        substitution.substituteSkuId,
      );
      alternatives.push({
        ...substitution,
        onHand: stock.onHand.toString(),
        available: stock.available.toString(),
      });
    }
    return alternatives;
  }

  async addSubstitution(
    input: {
      skuId: string;
      substituteSkuId: string;
      priority?: number | undefined;
      note?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<SubstitutionView> {
    if (input.skuId === input.substituteSkuId) {
      throw new DomainError('VALIDATION_FAILED', 'A SKU cannot substitute itself');
    }
    if (
      input.priority !== undefined &&
      (!Number.isInteger(input.priority) || input.priority < 1 || input.priority > 100)
    ) {
      throw new DomainError('VALIDATION_FAILED', 'Priority must be a whole number 1-100');
    }
    for (const id of [input.skuId, input.substituteSkuId]) {
      const sku = await this.prisma.sku.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!sku) throw notFound('Sku', id);
    }
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.skuSubstitution.create({
          data: {
            tenantId: ctx.tenantId,
            skuId: input.skuId,
            substituteSkuId: input.substituteSkuId,
            priority: input.priority ?? 1,
            note: input.note?.trim() || null,
          },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'pim.substitution.add',
          objectType: 'SkuSubstitution',
          objectId: created.id,
          source: 'api',
          newValues: { skuId: input.skuId, substituteSkuId: input.substituteSkuId },
        });
        return created;
      });
      const [view] = await this.views(ctx.tenantId, [row]);
      return view!;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', 'This substitution already exists');
      }
      throw error;
    }
  }

  async removeSubstitution(substitutionId: string, ctx: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.skuSubstitution.findFirst({
        where: { id: substitutionId, tenantId: ctx.tenantId },
      });
      if (!existing) throw notFound('SkuSubstitution', substitutionId);
      await tx.skuSubstitution.delete({ where: { id: existing.id } });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'pim.substitution.remove',
        objectType: 'SkuSubstitution',
        objectId: existing.id,
        source: 'api',
        previousValues: {
          skuId: existing.skuId,
          substituteSkuId: existing.substituteSkuId,
        },
      });
    });
  }
}

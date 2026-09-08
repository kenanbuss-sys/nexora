import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Maintenance (EAM-003..009/011/012/013). Maintenance work rides the
 * ordinary task engine; stock effects of spare parts go through the
 * WMS public interface; meters, checkouts and costs live in the
 * append-only audit trail. Assets flip through their own lifecycle —
 * downtime is simply time UNDER_MAINTENANCE, measured from the trail.
 */

/** Cross-domain contract: tenant configuration (owned by core). */
export interface MaintenanceConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
}

/** Cross-domain contract: tasks (owned by core). */
export interface MaintenanceTaskGate {
  createTask(
    input: { title: string; description?: string },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
}

/** Cross-domain contract: stock truth (owned by WMS). */
export interface MaintenanceStockGate {
  postMovement(
    input: {
      warehouseId: string;
      skuId: string;
      movementType: 'ISSUE';
      quantity: number;
      idempotencyKey: string;
      reason?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ movementId: string; duplicate: boolean }>;
}

export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration: MaintenanceConfigGate,
    private readonly tasks: MaintenanceTaskGate,
    private readonly stock?: MaintenanceStockGate,
  ) {}

  /**
   * Preventive maintenance (EAM-003/008): configured plans
   * (`eam.preventive`: [{ assetNumber, everyDays, checklist? }]) fire
   * one task per asset per period — a re-run in the same period is a
   * no-op; the checklist travels in the task body.
   */
  async runPreventive(ctx: RequestContext): Promise<{ created: number; skipped: number }> {
    const { config } = await this.configuration.getEffectiveConfiguration(ctx.tenantId);
    const eam = ((config as Record<string, unknown>).eam ?? {}) as Record<string, unknown>;
    const plans = Array.isArray(eam.preventive)
      ? (eam.preventive as Array<Record<string, unknown>>)
      : [];
    let created = 0;
    let skipped = 0;
    for (const plan of plans) {
      const assetNumber = typeof plan.assetNumber === 'string' ? plan.assetNumber : null;
      const everyDays = Number(plan.everyDays);
      if (!assetNumber || !Number.isFinite(everyDays) || everyDays < 1) continue;
      const asset = await this.prisma.asset.findFirst({
        where: { tenantId: ctx.tenantId, assetNumber },
      });
      if (!asset || asset.status === 'RETIRED') continue;
      const period = Math.floor(Date.now() / (everyDays * 86_400_000));
      const marker = `${asset.id}:pm:${period}`;
      const already = await this.prisma.auditEvent.findFirst({
        where: {
          tenantId: ctx.tenantId,
          action: 'eam.pm.schedule',
          objectType: 'Asset',
          objectId: marker,
        },
        select: { id: true },
      });
      if (already) {
        skipped += 1;
        continue;
      }
      const checklist = Array.isArray(plan.checklist)
        ? (plan.checklist as unknown[]).map(String).join('; ')
        : undefined;
      await this.tasks.createTask(
        {
          title: `Preventivno održavanje: ${asset.name} (${asset.assetNumber})`,
          ...(checklist ? { description: `Kontrolna lista: ${checklist}` } : {}),
        },
        ctx,
      );
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'eam.pm.schedule',
        objectType: 'Asset',
        objectId: marker,
        source: 'api',
        newValues: { assetNumber, everyDays, period },
      });
      created += 1;
    }
    return { created, skipped };
  }

  /** Corrective maintenance (EAM-004): breakdown → task + downtime start. */
  async reportBreakdown(
    input: { assetId: string; description: string },
    ctx: RequestContext,
  ): Promise<{ taskId: string }> {
    if (input.description.trim().length < 5) {
      throw new DomainError('VALIDATION_FAILED', 'Describe the breakdown');
    }
    const asset = await this.prisma.asset.findFirst({
      where: { id: input.assetId, tenantId: ctx.tenantId },
    });
    if (!asset) throw notFound('Asset', input.assetId);
    if (asset.status !== 'IN_SERVICE') {
      throw new DomainError('INVALID_STATE', 'Only in-service assets break down');
    }
    const task = await this.tasks.createTask(
      {
        title: `Kvar: ${asset.name} (${asset.assetNumber})`,
        description: input.description.trim(),
      },
      ctx,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.asset.update({ where: { id: asset.id }, data: { status: 'UNDER_MAINTENANCE' } });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'eam.breakdown',
        objectType: 'Asset',
        objectId: asset.id,
        source: 'api',
        newValues: { description: input.description.trim(), taskId: task.id },
      });
    });
    return { taskId: task.id };
  }

  /**
   * Completion (EAM-006/007/013): labor hours and consumed spare
   * parts (issued through the ledger, idempotent per completion) are
   * recorded on the trail; the asset returns to service.
   */
  async completeMaintenance(
    input: {
      assetId: string;
      completionKey: string;
      laborHours: number;
      laborRate?: number | undefined;
      parts?: Array<{ skuId: string; warehouseId: string; quantity: number }> | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ ok: true; cost: string; duplicate: boolean }> {
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(input.completionKey)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid completion key');
    }
    if (!(input.laborHours >= 0 && input.laborHours <= 1000)) {
      throw new DomainError('VALIDATION_FAILED', 'Labor hours must be 0..1000');
    }
    const asset = await this.prisma.asset.findFirst({
      where: { id: input.assetId, tenantId: ctx.tenantId },
    });
    if (!asset) throw notFound('Asset', input.assetId);
    const marker = `${asset.id}:done:${input.completionKey}`;
    const already = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'eam.maintenance.complete',
        objectType: 'Asset',
        objectId: marker,
      },
    });
    if (already) {
      const cost = (already.newValues as { cost?: string } | null)?.cost ?? '0.00';
      return { ok: true, cost, duplicate: true };
    }
    if (asset.status !== 'UNDER_MAINTENANCE') {
      throw new DomainError('INVALID_STATE', 'The asset is not under maintenance');
    }
    for (const part of input.parts ?? []) {
      if (!this.stock) {
        throw new DomainError('INVALID_STATE', 'Spare-part issue is not wired');
      }
      await this.stock.postMovement(
        {
          warehouseId: part.warehouseId,
          skuId: part.skuId,
          movementType: 'ISSUE',
          quantity: part.quantity,
          idempotencyKey: `eam:${marker}:${part.skuId}`,
          reason: `Održavanje ${asset.assetNumber}`,
        },
        ctx,
      );
    }
    const laborRate = input.laborRate ?? 0;
    const cost = (input.laborHours * laborRate).toFixed(2);
    await this.prisma.$transaction(async (tx) => {
      await tx.asset.update({ where: { id: asset.id }, data: { status: 'IN_SERVICE' } });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'eam.maintenance.complete',
        objectType: 'Asset',
        objectId: marker,
        source: 'api',
        newValues: {
          assetId: asset.id,
          laborHours: input.laborHours,
          parts: (input.parts ?? []).length,
          cost,
        },
      });
    });
    return { ok: true, cost, duplicate: false };
  }

  /** Meters (EAM-009/014): idempotent counter readings on the trail. */
  async recordMeter(
    input: { assetId: string; meter: string; value: number; readingId: string },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(input.meter)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid meter name');
    }
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(input.readingId)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid reading id');
    }
    const asset = await this.prisma.asset.findFirst({
      where: { id: input.assetId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!asset) throw notFound('Asset', input.assetId);
    const marker = `${asset.id}:meter:${input.readingId}`;
    const already = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'eam.meter',
        objectType: 'Asset',
        objectId: marker,
      },
      select: { id: true },
    });
    if (already) return { ok: true, duplicate: true };
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'eam.meter',
      objectType: 'Asset',
      objectId: marker,
      source: 'api',
      newValues: { assetId: asset.id, meter: input.meter, value: input.value },
    });
    return { ok: true, duplicate: false };
  }

  /** Tool checkout (EAM-011): one holder at a time, on the trail. */
  async toolCheckout(
    input: { assetId: string; event: 'OUT' | 'IN'; holder: string },
    ctx: RequestContext,
  ): Promise<{ ok: true; holder: string | null }> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: input.assetId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!asset) throw notFound('Asset', input.assetId);
    const last = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'eam.tool.checkout',
        objectType: 'Asset',
        objectId: asset.id,
      },
      orderBy: { occurredAt: 'desc' },
    });
    const lastEvent = (last?.newValues as { event?: string } | null)?.event ?? 'IN';
    if (input.event === 'OUT' && lastEvent === 'OUT') {
      throw new DomainError('CONFLICT', 'The tool is already checked out');
    }
    if (input.event === 'IN' && lastEvent === 'IN') {
      throw new DomainError('INVALID_STATE', 'The tool is not checked out');
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'eam.tool.checkout',
      objectType: 'Asset',
      objectId: asset.id,
      source: 'api',
      newValues: { event: input.event, holder: input.holder.trim() },
    });
    return { ok: true, holder: input.event === 'OUT' ? input.holder.trim() : null };
  }

  /**
   * Asset costs & downtime & warranty (EAM-005/012/013): everything
   * the trail knows about one asset, plus warranty state from
   * configuration (`eam.warranties`: [{ assetNumber, until }]).
   */
  async assetReport(
    assetId: string,
    ctx: RequestContext,
  ): Promise<{
    assetNumber: string;
    maintenanceCost: string;
    completions: number;
    breakdowns: number;
    warrantyUntil: string | null;
    warrantyExpired: boolean | null;
  }> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId: ctx.tenantId },
    });
    if (!asset) throw notFound('Asset', assetId);
    const [completions, breakdowns] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where: {
          tenantId: ctx.tenantId,
          action: 'eam.maintenance.complete',
          objectType: 'Asset',
          objectId: { startsWith: `${asset.id}:done:` },
        },
      }),
      this.prisma.auditEvent.count({
        where: {
          tenantId: ctx.tenantId,
          action: 'eam.breakdown',
          objectType: 'Asset',
          objectId: asset.id,
        },
      }),
    ]);
    const cost = completions.reduce(
      (acc, event) => acc + Number((event.newValues as { cost?: string } | null)?.cost ?? 0),
      0,
    );
    let warrantyUntil: string | null = null;
    try {
      const { config } = await this.configuration.getEffectiveConfiguration(ctx.tenantId);
      const eam = ((config as Record<string, unknown>).eam ?? {}) as Record<string, unknown>;
      const warranties = Array.isArray(eam.warranties)
        ? (eam.warranties as Array<Record<string, unknown>>)
        : [];
      const entry = warranties.find((w) => w.assetNumber === asset.assetNumber);
      if (entry && typeof entry.until === 'string') warrantyUntil = entry.until;
    } catch {
      warrantyUntil = null;
    }
    return {
      assetNumber: asset.assetNumber,
      maintenanceCost: cost.toFixed(2),
      completions: completions.length,
      breakdowns,
      warrantyUntil,
      warrantyExpired:
        warrantyUntil === null ? null : new Date(warrantyUntil).getTime() < Date.now(),
    };
  }
}

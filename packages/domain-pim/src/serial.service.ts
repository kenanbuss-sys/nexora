import { writeAudit } from '@nexora/audit';
import type { PrismaClient, SerialPolicy, SerialStatus } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Serial-number policy and registry (PIM-011/WMS-018). A SKU declares
 * how serials are enforced (NONE/OPTIONAL/REQUIRED); the registry
 * holds one row per physical unit with an explicit lifecycle:
 *
 *   IN_STOCK -> SHIPPED -> RETURNED -> IN_STOCK
 *   IN_STOCK/RETURNED -> SCRAPPED (terminal)
 *
 * Every mutation is audited; registration is idempotency-friendly —
 * an already-known serial is reported, never silently duplicated.
 */

export interface SerialView {
  id: string;
  serial: string;
  status: SerialStatus;
  note: string | null;
  updatedAt: string;
}

const TRANSITIONS: Record<SerialStatus, SerialStatus[]> = {
  IN_STOCK: ['SHIPPED', 'SCRAPPED'],
  SHIPPED: ['RETURNED'],
  RETURNED: ['IN_STOCK', 'SCRAPPED'],
  SCRAPPED: [],
};

const SERIAL_RE = /^[A-Za-z0-9._/-]{3,64}$/;

/** processed_event consumer name for the registry sync. */
export const SERIAL_REGISTRY_CONSUMER = 'pim.serial-registry';

export class SerialService {
  constructor(private readonly prisma: PrismaClient) {}

  private async requireSku(tenantId: string, skuId: string) {
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, tenantId } });
    if (!sku) throw notFound('Sku', skuId);
    return sku;
  }

  async setPolicy(skuId: string, policy: SerialPolicy, ctx: RequestContext): Promise<void> {
    const sku = await this.requireSku(ctx.tenantId, skuId);
    if (policy === 'NONE') {
      const live = await this.prisma.serialNumber.count({
        where: { tenantId: ctx.tenantId, skuId, status: { in: ['IN_STOCK', 'SHIPPED'] } },
      });
      if (live > 0) {
        throw new DomainError(
          'INVALID_STATE',
          `Cannot disable serial tracking while ${live} serial(s) are in stock or shipped`,
        );
      }
    }
    await this.prisma.sku.update({ where: { id: sku.id }, data: { serialPolicy: policy } });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'pim.sku.serial_policy',
      objectType: 'Sku',
      objectId: sku.id,
      source: 'api',
      previousValues: { policy: sku.serialPolicy },
      newValues: { policy },
    });
  }

  async listSerials(
    skuId: string,
    status: SerialStatus | undefined,
    ctx: RequestContext,
  ): Promise<{ policy: SerialPolicy; serials: SerialView[] }> {
    const sku = await this.requireSku(ctx.tenantId, skuId);
    const rows = await this.prisma.serialNumber.findMany({
      where: { tenantId: ctx.tenantId, skuId, ...(status ? { status } : {}) },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    return {
      policy: sku.serialPolicy,
      serials: rows.map((r) => ({
        id: r.id,
        serial: r.serial,
        status: r.status,
        note: r.note,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  /** Register serials as received units; existing ones are reported, not duplicated. */
  async registerSerials(
    skuId: string,
    serials: string[],
    ctx: RequestContext,
  ): Promise<{ created: number; existing: string[] }> {
    const sku = await this.requireSku(ctx.tenantId, skuId);
    if (sku.serialPolicy === 'NONE') {
      throw new DomainError('INVALID_STATE', 'This SKU is not serial-tracked');
    }
    if (serials.length === 0 || serials.length > 500) {
      throw new DomainError('VALIDATION_FAILED', 'Provide between 1 and 500 serials');
    }
    const cleaned = [...new Set(serials.map((s) => s.trim()).filter(Boolean))];
    for (const serial of cleaned) {
      if (!SERIAL_RE.test(serial)) {
        throw new DomainError('VALIDATION_FAILED', `Invalid serial format: ${serial}`);
      }
    }
    const known = await this.prisma.serialNumber.findMany({
      where: { tenantId: ctx.tenantId, skuId, serial: { in: cleaned } },
      select: { serial: true },
    });
    const existing = new Set(known.map((k) => k.serial));
    const fresh = cleaned.filter((s) => !existing.has(s));
    if (fresh.length > 0) {
      await this.prisma.serialNumber.createMany({
        data: fresh.map((serial) => ({ tenantId: ctx.tenantId, skuId, serial })),
      });
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'pim.serial.register',
        objectType: 'Sku',
        objectId: skuId,
        source: 'api',
        newValues: { count: fresh.length },
      });
    }
    return { created: fresh.length, existing: [...existing] };
  }

  async updateStatus(
    serialId: string,
    status: SerialStatus,
    note: string | undefined,
    ctx: RequestContext,
  ): Promise<SerialView> {
    const row = await this.prisma.serialNumber.findFirst({
      where: { id: serialId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('SerialNumber', serialId);
    if (!TRANSITIONS[row.status].includes(status)) {
      throw new DomainError('INVALID_STATE', `Serial cannot go from ${row.status} to ${status}`);
    }
    const updated = await this.prisma.serialNumber.update({
      where: { id: row.id },
      data: { status, note: note ?? row.note },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'pim.serial.status',
      objectType: 'SerialNumber',
      objectId: row.id,
      source: 'api',
      previousValues: { status: row.status },
      newValues: { status },
    });
    return {
      id: updated.id,
      serial: updated.serial,
      status: updated.status,
      note: updated.note,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * WMS-018 (Sprint 239): keeps the serial identity registry in step with
   * the stock ledger by consuming `stock.moved` events that carry serials.
   * Idempotent per event (processed_event claim in the same transaction).
   * WMS owns the unit's position; this only reflects the life-cycle status:
   * inbound → IN_STOCK (registered if new), ISSUE → SHIPPED; transfers and
   * adjustments leave the status as is.
   */
  async applyStockMovedEvent(event: {
    id: string;
    tenantId: string;
    eventType: string;
    payload: unknown;
  }): Promise<{ applied: number }> {
    if (event.eventType !== 'stock.moved') return { applied: 0 };
    const p = (event.payload ?? {}) as {
      skuId?: string;
      serials?: string[];
      movementType?: string;
      movementId?: string;
    };
    if (!p.skuId || !Array.isArray(p.serials) || p.serials.length === 0 || !p.movementType) {
      return { applied: 0 };
    }
    const inbound = ['RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN'].includes(p.movementType);
    const status: SerialStatus | null = inbound
      ? 'IN_STOCK'
      : p.movementType === 'ISSUE'
        ? 'SHIPPED'
        : null;
    let applied = 0;
    await this.prisma.$transaction(async (tx) => {
      try {
        await tx.processedEvent.create({
          data: { tenantId: event.tenantId, eventId: event.id, consumer: SERIAL_REGISTRY_CONSUMER },
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') return;
        throw error;
      }
      if (!status) return;
      for (const serial of p.serials!) {
        const existing = await tx.serialNumber.findFirst({
          where: { tenantId: event.tenantId, skuId: p.skuId!, serial },
        });
        if (existing) {
          if (existing.status === status) continue;
          await tx.serialNumber.updateMany({
            where: { id: existing.id, tenantId: event.tenantId },
            data: { status },
          });
        } else if (inbound) {
          await tx.serialNumber.create({
            data: { tenantId: event.tenantId, skuId: p.skuId!, serial, status },
          });
        } else {
          continue;
        }
        applied += 1;
      }
      if (applied > 0) {
        await writeAudit(tx, {
          tenantId: event.tenantId,
          actorType: 'SYSTEM',
          action: 'pim.serial.sync',
          objectType: 'Sku',
          objectId: p.skuId!,
          source: 'worker',
          newValues: { movementId: p.movementId ?? null, status, count: applied },
        });
      }
    });
    return { applied };
  }
}

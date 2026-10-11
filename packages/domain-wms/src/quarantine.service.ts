import { writeAudit } from '@nexora/audit';
import type {
  DispositionStatus,
  DispositionType,
  Prisma,
  PrismaClient,
  QuarantineStatus,
} from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Quarantine holds (QMS-006/WMS-006) and material-review dispositions
 * (QMS-005). A hold blocks a quantity of a SKU (optionally one lot) in a
 * warehouse from being reserved until quality decides. A disposition
 * splits the undecided quantity into lines:
 * - USE_AS_IS — back to availability (concession note required);
 * - SCRAP — ADJUSTMENT_OUT;
 * - RETURN_TO_SUPPLIER — ISSUE with the supplier reference;
 * - REGRADE — ADJUSTMENT_OUT of this SKU + ADJUSTMENT_IN of another SKU;
 * - REWORK — the quantity moves to a new ACTIVE child hold (stays blocked
 *   until re-inspected and decided again).
 *
 * Integrity: the decision is CLAIMED atomically first (the hold's
 * remaining quantity decreases under a row lock), then ledger lines are
 * posted through the stock ledger with deterministic idempotency keys.
 * A posting failure leaves the disposition FAILED with the claim kept;
 * `retryDisposition` finishes it without double effects. The stock
 * ledger stays the only truth — a hold never edits stock.
 */

export interface QuarantineView {
  id: string;
  warehouseId: string;
  skuId: string;
  skuCode: string;
  quantity: string;
  remainingQuantity: string;
  lotNumber: string | null;
  ncrId: string | null;
  parentHoldId: string | null;
  reason: string;
  status: QuarantineStatus;
  createdAt: string;
}

export interface DispositionLineInput {
  type: DispositionType;
  quantity: number;
  targetSkuId?: string | undefined;
  targetQuantity?: number | undefined;
  supplierRef?: string | undefined;
  serials?: string[] | undefined;
}

export interface DispositionView {
  id: string;
  holdId: string;
  requestKey: string;
  status: DispositionStatus;
  note: string | null;
  lastError: string | null;
  decidedBy: string | null;
  createdAt: string;
  postedAt: string | null;
  duplicate?: boolean;
  lines: Array<{
    lineNo: number;
    type: DispositionType;
    quantity: string;
    targetSkuId: string | null;
    targetQuantity: string | null;
    supplierRef: string | null;
    reworkHoldId: string | null;
    movementId: string | null;
    targetMovementId: string | null;
  }>;
}

type LedgerMovementType = 'ADJUSTMENT_OUT' | 'ADJUSTMENT_IN' | 'ISSUE';

/** Stock ledger gate owned by this same WMS package (+ PIM SKU state). */
export interface LedgerGate {
  postMovement(
    input: {
      warehouseId: string;
      skuId: string;
      movementType: LedgerMovementType;
      quantity: number;
      idempotencyKey: string;
      reason?: string | undefined;
      lotNumber?: string | undefined;
      serials?: string[] | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ movementId: string; duplicate: boolean }>;
  totalOnHand(tenantId: string, warehouseId: string, skuId: string): Promise<number>;
  /** Lot on-hand (WMS-017); only needed for lot-scoped holds. */
  lotOnHand?(
    tenantId: string,
    warehouseId: string,
    skuId: string,
    lotNumber: string,
  ): Promise<number>;
  skuState?(
    tenantId: string,
    skuId: string,
  ): Promise<{ exists: boolean; active: boolean; lotTracked?: boolean; serialPolicy?: string }>;
}

/** QC-owned NCR identity (QMS-007), read through QC's public gate. */
export interface NcrGate {
  ncrRef(
    tenantId: string,
    ncrId: string,
  ): Promise<{ id: string; skuId: string; status: string } | null>;
}

const TYPES: DispositionType[] = ['USE_AS_IS', 'SCRAP', 'RETURN_TO_SUPPLIER', 'REGRADE', 'REWORK'];
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export class QuarantineService {
  private ncrs: NcrGate | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly ledger: LedgerGate,
  ) {}

  /** Late binding: QC is wired after WMS. */
  bindNcrGate(gate: NcrGate): void {
    this.ncrs = gate;
  }

  private async toView(h: {
    id: string;
    warehouseId: string;
    skuId: string;
    quantity: { toString(): string };
    remainingQuantity: { toString(): string };
    lotNumber: string | null;
    ncrId: string | null;
    parentHoldId: string | null;
    reason: string;
    status: QuarantineStatus;
    createdAt: Date;
    tenantId: string;
  }): Promise<QuarantineView> {
    const sku = await this.prisma.sku.findFirst({
      where: { id: h.skuId, tenantId: h.tenantId },
      select: { code: true },
    });
    return {
      id: h.id,
      warehouseId: h.warehouseId,
      skuId: h.skuId,
      skuCode: sku?.code ?? '?',
      quantity: h.quantity.toString(),
      remainingQuantity: h.remainingQuantity.toString(),
      lotNumber: h.lotNumber,
      ncrId: h.ncrId,
      parentHoldId: h.parentHoldId,
      reason: h.reason,
      status: h.status,
      createdAt: h.createdAt.toISOString(),
    };
  }

  async listHolds(ctx: RequestContext): Promise<QuarantineView[]> {
    const rows = await this.prisma.quarantineHold.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return Promise.all(rows.map((r) => this.toView(r)));
  }

  async placeHold(
    input: {
      warehouseId: string;
      skuId: string;
      quantity: number;
      reason: string;
      lotNumber?: string | undefined;
      ncrId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<QuarantineView> {
    if (!(input.quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    if (!input.reason?.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'A reason is required');
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.warehouseId, tenantId: ctx.tenantId },
    });
    if (!warehouse) throw notFound('Warehouse', input.warehouseId);
    const sku = await this.prisma.sku.findFirst({
      where: { id: input.skuId, tenantId: ctx.tenantId },
    });
    if (!sku) throw notFound('Sku', input.skuId);
    const lotNumber = input.lotNumber?.trim() || null;
    if (lotNumber && !sku.lotTracked) {
      throw new DomainError('VALIDATION_FAILED', 'This SKU is not lot-tracked');
    }
    if (input.ncrId) {
      const ncr = this.ncrs ? await this.ncrs.ncrRef(ctx.tenantId, input.ncrId) : null;
      if (!ncr) throw notFound('Ncr', input.ncrId);
      if (ncr.skuId !== sku.id) {
        throw new DomainError('VALIDATION_FAILED', 'The NCR concerns a different SKU');
      }
    }
    const onHand = lotNumber
      ? this.ledger.lotOnHand
        ? await this.ledger.lotOnHand(ctx.tenantId, input.warehouseId, input.skuId, lotNumber)
        : 0
      : await this.ledger.totalOnHand(ctx.tenantId, input.warehouseId, input.skuId);

    const created = await this.prisma.$transaction(async (tx) => {
      // Serialise holds on the same stock so two holds cannot both pass
      // the "un-held on-hand" check.
      await lockHoldScope(tx, ctx.tenantId, input.warehouseId, input.skuId);
      const held = await this.heldIn(tx, ctx.tenantId, input.warehouseId, input.skuId, lotNumber);
      if (input.quantity > round6(onHand - held)) {
        throw new DomainError(
          'INVALID_STATE',
          lotNumber
            ? 'Cannot quarantine more than the un-held stock of this lot'
            : 'Cannot quarantine more than un-held on-hand stock',
        );
      }
      const hold = await tx.quarantineHold.create({
        data: {
          tenantId: ctx.tenantId,
          warehouseId: input.warehouseId,
          skuId: input.skuId,
          quantity: input.quantity,
          remainingQuantity: input.quantity,
          lotNumber,
          ncrId: input.ncrId ?? null,
          reason: input.reason.trim(),
          createdBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'wms.quarantine.place',
        objectType: 'QuarantineHold',
        objectId: hold.id,
        source: 'api',
        newValues: {
          skuId: input.skuId,
          quantity: input.quantity,
          reason: input.reason.trim(),
          ...(lotNumber ? { lotNumber } : {}),
          ...(input.ncrId ? { ncrId: input.ncrId } : {}),
        },
      });
      return hold;
    });
    return this.toView(created);
  }

  /**
   * Legacy single decision (Sprint 082): the whole remaining quantity is
   * released (USE_AS_IS) or scrapped — now through the disposition path.
   */
  async decide(
    holdId: string,
    decision: 'RELEASE' | 'SCRAP',
    ctx: RequestContext,
  ): Promise<QuarantineView> {
    const hold = await this.prisma.quarantineHold.findFirst({
      where: { id: holdId, tenantId: ctx.tenantId },
    });
    if (!hold) throw notFound('QuarantineHold', holdId);
    if (hold.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', 'This hold is already decided');
    }
    await this.dispose(
      holdId,
      {
        requestKey: `legacy:${hold.id}:${decision}`,
        note: decision === 'RELEASE' ? 'Released by quality' : undefined,
        lines: [
          {
            type: decision === 'RELEASE' ? 'USE_AS_IS' : 'SCRAP',
            quantity: Number(hold.remainingQuantity),
          },
        ],
      },
      ctx,
    );
    const fresh = await this.prisma.quarantineHold.findFirst({ where: { id: hold.id } });
    return this.toView(fresh as NonNullable<typeof fresh>);
  }

  /**
   * Permission: quality release (route). Material-review disposition of a
   * hold (QMS-005). Idempotent per `requestKey`: a replay returns the same
   * disposition (and finishes posting if it had failed).
   */
  async dispose(
    holdId: string,
    input: { requestKey: string; note?: string | undefined; lines: DispositionLineInput[] },
    ctx: RequestContext,
  ): Promise<DispositionView> {
    const requestKey = input.requestKey.trim();
    if (requestKey.length < 8 || requestKey.length > 128) {
      throw new DomainError('VALIDATION_FAILED', 'requestKey must be 8-128 chars');
    }
    const note = input.note?.trim() || null;
    const replay = await this.prisma.quarantineDisposition.findUnique({
      where: { tenantId_requestKey: { tenantId: ctx.tenantId, requestKey } },
    });
    if (replay) {
      if (replay.holdId !== holdId) {
        throw new DomainError('CONFLICT', 'requestKey already used for another hold');
      }
      const view =
        replay.status === 'POSTED'
          ? await this.dispositionView(replay.id, ctx)
          : await this.postLines(replay.id, ctx);
      return { ...view, duplicate: true };
    }

    const lines = this.validateLines(input.lines, note);
    const hold = await this.prisma.quarantineHold.findFirst({
      where: { id: holdId, tenantId: ctx.tenantId },
    });
    if (!hold) throw notFound('QuarantineHold', holdId);
    for (const line of lines) {
      if (line.type !== 'REGRADE') continue;
      if (line.targetSkuId === hold.skuId) {
        throw new DomainError('VALIDATION_FAILED', 'Regrade needs a different target SKU');
      }
      const target = this.ledger.skuState
        ? await this.ledger.skuState(ctx.tenantId, line.targetSkuId!)
        : { exists: false, active: false };
      if (!target.exists) throw notFound('Sku', line.targetSkuId!);
      if (!target.active) {
        throw new DomainError('INVALID_STATE', 'The regrade target SKU is not active');
      }
      if (target.lotTracked && !hold.lotNumber) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'A lot-tracked target SKU needs a lot-scoped hold to carry the lot number',
        );
      }
      if (target.serialPolicy === 'REQUIRED') {
        throw new DomainError(
          'VALIDATION_FAILED',
          'Regrade into a serial-required SKU is not supported — receive it with serials instead',
        );
      }
    }

    let dispositionId: string;
    try {
      dispositionId = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{ status: QuarantineStatus; remaining: string }>
        >`SELECT status, remaining_quantity::text AS remaining FROM quarantine_hold
            WHERE id = ${hold.id}::uuid AND tenant_id = ${ctx.tenantId}::uuid FOR UPDATE`;
        const row = locked[0]!;
        if (row.status !== 'ACTIVE') {
          throw new DomainError('INVALID_STATE', 'This hold is already decided');
        }
        const remaining = Number(row.remaining);
        const total = round6(lines.reduce((sum, l) => sum + l.quantity, 0));
        if (total > remaining) {
          throw new DomainError('INVALID_STATE', 'Disposition exceeds the undecided quantity', {
            remaining: row.remaining,
            requested: total.toString(),
          });
        }
        const left = round6(remaining - total);
        const types = new Set(lines.map((l) => l.type));
        const status: QuarantineStatus =
          left > 0
            ? 'ACTIVE'
            : types.size === 1 && types.has('USE_AS_IS')
              ? 'RELEASED'
              : types.size === 1 && types.has('SCRAP')
                ? 'SCRAPPED'
                : 'DISPOSED';
        await tx.quarantineHold.update({
          where: { id: hold.id },
          data: {
            remainingQuantity: left,
            status,
            ...(left === 0 ? { decidedBy: ctx.userId ?? null } : {}),
          },
        });
        const disposition = await tx.quarantineDisposition.create({
          data: {
            tenantId: ctx.tenantId,
            holdId: hold.id,
            requestKey,
            note,
            decidedBy: ctx.userId ?? null,
          },
        });
        let lineNo = 0;
        for (const line of lines) {
          lineNo += 1;
          let reworkHoldId: string | null = null;
          if (line.type === 'REWORK') {
            const child = await tx.quarantineHold.create({
              data: {
                tenantId: ctx.tenantId,
                warehouseId: hold.warehouseId,
                skuId: hold.skuId,
                quantity: line.quantity,
                remainingQuantity: line.quantity,
                lotNumber: hold.lotNumber,
                ncrId: hold.ncrId,
                parentHoldId: hold.id,
                reason: `Rework: ${hold.reason}`.slice(0, 300),
                createdBy: ctx.userId ?? null,
              },
            });
            reworkHoldId = child.id;
          }
          await tx.quarantineDispositionLine.create({
            data: {
              tenantId: ctx.tenantId,
              dispositionId: disposition.id,
              lineNo,
              type: line.type,
              quantity: line.quantity,
              targetSkuId: line.targetSkuId ?? null,
              targetQuantity: line.type === 'REGRADE' ? (line.targetQuantity ?? null) : null,
              supplierRef: line.supplierRef ?? null,
              reworkHoldId,
            },
          });
        }
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'wms.quarantine.dispose',
          objectType: 'QuarantineHold',
          objectId: hold.id,
          source: 'api',
          previousValues: { remainingQuantity: row.remaining, status: row.status },
          newValues: {
            dispositionId: disposition.id,
            remainingQuantity: left,
            status,
            note,
            lines: lines.map((l) => ({
              type: l.type,
              quantity: l.quantity,
              ...(l.targetSkuId ? { targetSkuId: l.targetSkuId } : {}),
              ...(l.supplierRef ? { supplierRef: l.supplierRef } : {}),
            })),
          } as Prisma.InputJsonValue,
        });
        return disposition.id;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        // Concurrent submission of the same requestKey: return the winner.
        const winner = await this.prisma.quarantineDisposition.findUnique({
          where: { tenantId_requestKey: { tenantId: ctx.tenantId, requestKey } },
        });
        if (winner) return { ...(await this.dispositionView(winner.id, ctx)), duplicate: true };
      }
      throw error;
    }
    // Serials are not persisted on the line; keep them for this call only.
    return this.postLines(dispositionId, ctx, lines);
  }

  /** Permission: quality release. Finishes a FAILED disposition idempotently. */
  async retryDisposition(dispositionId: string, ctx: RequestContext): Promise<DispositionView> {
    const row = await this.prisma.quarantineDisposition.findFirst({
      where: { id: dispositionId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('QuarantineDisposition', dispositionId);
    if (row.status === 'POSTED') return this.dispositionView(row.id, ctx);
    return this.postLines(row.id, ctx);
  }

  async listDispositions(holdId: string, ctx: RequestContext): Promise<DispositionView[]> {
    const hold = await this.prisma.quarantineHold.findFirst({
      where: { id: holdId, tenantId: ctx.tenantId },
    });
    if (!hold) throw notFound('QuarantineHold', holdId);
    const rows = await this.prisma.quarantineDisposition.findMany({
      where: { tenantId: ctx.tenantId, holdId: hold.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return Promise.all(rows.map((r) => this.dispositionView(r.id, ctx)));
  }

  private validateLines(lines: DispositionLineInput[], note: string | null) {
    if (!Array.isArray(lines) || lines.length === 0 || lines.length > 20) {
      throw new DomainError('VALIDATION_FAILED', 'A disposition needs 1-20 lines');
    }
    return lines.map((line) => {
      if (!TYPES.includes(line.type)) {
        throw new DomainError('VALIDATION_FAILED', `Unknown disposition ${String(line.type)}`);
      }
      if (!(line.quantity > 0)) {
        throw new DomainError('VALIDATION_FAILED', 'Line quantity must be positive');
      }
      if (line.type === 'USE_AS_IS' && (!note || note.length < 10)) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'Use-as-is needs a concession note (at least 10 characters)',
        );
      }
      if (line.type === 'REGRADE') {
        if (!line.targetSkuId) {
          throw new DomainError('VALIDATION_FAILED', 'Regrade needs a target SKU');
        }
        const targetQuantity = line.targetQuantity ?? line.quantity;
        if (!(targetQuantity > 0)) {
          throw new DomainError('VALIDATION_FAILED', 'Regrade target quantity must be positive');
        }
        return { ...line, targetQuantity };
      }
      if (line.targetSkuId || line.targetQuantity !== undefined) {
        throw new DomainError('VALIDATION_FAILED', 'Only a regrade has a target SKU');
      }
      if (line.type === 'RETURN_TO_SUPPLIER' && !line.supplierRef?.trim()) {
        throw new DomainError('VALIDATION_FAILED', 'A supplier return needs a supplier reference');
      }
      return { ...line, supplierRef: line.supplierRef?.trim() || undefined };
    });
  }

  /**
   * Posts the ledger effects of a claimed disposition. Keys are
   * deterministic per (disposition, line), so repeated calls never post
   * twice; a failure marks the disposition FAILED with the error kept.
   */
  private async postLines(
    dispositionId: string,
    ctx: RequestContext,
    fresh?: DispositionLineInput[],
  ): Promise<DispositionView> {
    const disposition = await this.prisma.quarantineDisposition.findFirst({
      where: { id: dispositionId, tenantId: ctx.tenantId },
      include: { hold: true, lines: { orderBy: { lineNo: 'asc' } } },
    });
    if (!disposition) throw notFound('QuarantineDisposition', dispositionId);
    const hold = disposition.hold;
    const lot = hold.lotNumber ?? undefined;
    try {
      for (const line of disposition.lines) {
        const qty = Number(line.quantity);
        const serials = fresh?.[line.lineNo - 1]?.serials;
        const key = `qdisp:${disposition.id}:${line.lineNo}`;
        const base = {
          warehouseId: hold.warehouseId,
          skuId: hold.skuId,
          quantity: qty,
          lotNumber: lot,
          ...(serials && serials.length > 0 ? { serials } : {}),
        };
        let movementId: string | null = line.movementId;
        let targetMovementId: string | null = line.targetMovementId;
        if (line.type === 'SCRAP' && !movementId) {
          movementId = (
            await this.ledger.postMovement(
              {
                ...base,
                movementType: 'ADJUSTMENT_OUT',
                idempotencyKey: key,
                reason: `Quarantine scrap: ${hold.reason}`.slice(0, 500),
              },
              ctx,
            )
          ).movementId;
        }
        if (line.type === 'RETURN_TO_SUPPLIER' && !movementId) {
          movementId = (
            await this.ledger.postMovement(
              {
                ...base,
                movementType: 'ISSUE',
                idempotencyKey: key,
                reason: `Return to supplier ${line.supplierRef ?? ''}: ${hold.reason}`.slice(
                  0,
                  500,
                ),
              },
              ctx,
            )
          ).movementId;
        }
        if (line.type === 'REGRADE') {
          if (!movementId) {
            movementId = (
              await this.ledger.postMovement(
                {
                  ...base,
                  movementType: 'ADJUSTMENT_OUT',
                  idempotencyKey: `${key}:out`,
                  reason: `Quarantine regrade out: ${hold.reason}`.slice(0, 500),
                },
                ctx,
              )
            ).movementId;
          }
          if (!targetMovementId) {
            targetMovementId = (
              await this.ledger.postMovement(
                {
                  warehouseId: hold.warehouseId,
                  skuId: line.targetSkuId!,
                  quantity: Number(line.targetQuantity),
                  lotNumber: lot,
                  movementType: 'ADJUSTMENT_IN',
                  idempotencyKey: `${key}:in`,
                  reason: `Quarantine regrade in (from hold ${hold.id})`,
                },
                ctx,
              )
            ).movementId;
          }
        }
        if (movementId !== line.movementId || targetMovementId !== line.targetMovementId) {
          await this.prisma.quarantineDispositionLine.update({
            where: { id: line.id },
            data: { movementId, targetMovementId },
          });
        }
      }
      await this.prisma.quarantineDisposition.updateMany({
        where: { id: disposition.id, status: { not: 'POSTED' } },
        data: { status: 'POSTED', postedAt: new Date(), lastError: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Posting failed';
      await this.prisma.quarantineDisposition.updateMany({
        where: { id: disposition.id, status: { not: 'POSTED' } },
        data: { status: 'FAILED', lastError: message },
      });
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'wms.quarantine.dispose_failed',
        objectType: 'QuarantineDisposition',
        objectId: disposition.id,
        source: 'api',
        newValues: { error: message },
      });
      throw error;
    }
    return this.dispositionView(disposition.id, ctx);
  }

  private async dispositionView(id: string, ctx: RequestContext): Promise<DispositionView> {
    const d = await this.prisma.quarantineDisposition.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    if (!d) throw notFound('QuarantineDisposition', id);
    return {
      id: d.id,
      holdId: d.holdId,
      requestKey: d.requestKey,
      status: d.status,
      note: d.note,
      lastError: d.lastError,
      decidedBy: d.decidedBy,
      createdAt: d.createdAt.toISOString(),
      postedAt: d.postedAt?.toISOString() ?? null,
      lines: d.lines.map((l) => ({
        lineNo: l.lineNo,
        type: l.type,
        quantity: l.quantity.toString(),
        targetSkuId: l.targetSkuId,
        targetQuantity: l.targetQuantity?.toString() ?? null,
        supplierRef: l.supplierRef,
        reworkHoldId: l.reworkHoldId,
        movementId: l.movementId,
        targetMovementId: l.targetMovementId,
      })),
    };
  }

  private async heldIn(
    db: Prisma.TransactionClient | PrismaClient,
    tenantId: string,
    warehouseId: string,
    skuId: string,
    lotNumber: string | null,
  ): Promise<number> {
    const agg = await db.quarantineHold.aggregate({
      where: {
        tenantId,
        warehouseId,
        skuId,
        status: 'ACTIVE',
        ...(lotNumber ? { lotNumber } : {}),
      },
      _sum: { remainingQuantity: true },
    });
    return agg._sum.remainingQuantity ? Number(agg._sum.remainingQuantity) : 0;
  }

  /** Total ACTIVE undecided quantity for one warehouse+SKU. */
  async activeHeld(tenantId: string, warehouseId: string, skuId: string): Promise<number> {
    return this.heldIn(this.prisma, tenantId, warehouseId, skuId, null);
  }

  /** Total ACTIVE undecided per SKU across warehouses (for tenant-wide views). */
  async activeHeldBySku(tenantId: string, skuIds: string[]): Promise<Map<string, number>> {
    if (skuIds.length === 0) return new Map();
    const rows = await this.prisma.quarantineHold.groupBy({
      by: ['skuId'],
      where: { tenantId, skuId: { in: skuIds }, status: 'ACTIVE' },
      _sum: { remainingQuantity: true },
    });
    return new Map(rows.map((r) => [r.skuId, Number(r._sum.remainingQuantity ?? 0)]));
  }
}

async function lockHoldScope(
  tx: Prisma.TransactionClient,
  tenantId: string,
  warehouseId: string,
  skuId: string,
): Promise<void> {
  const key = `wms.quarantine:${tenantId}:${warehouseId}:${skuId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

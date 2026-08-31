import { writeAudit } from '@nexora/audit';
import type { EcStatus, PrismaClient, RevisionStatus } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Engineering — versioned BOMs (ENG-001/002/003) with a single RELEASED
 * revision per SKU (ENG-006), deterministic multi-level explosion,
 * routings with standard times (ENG-011/013), and engineering change
 * requests (ENG-007) with separated decision rights.
 *
 * Revision machine: DRAFT -> RELEASED -> OBSOLETE. Releasing version N
 * obsoletes the previously released version in the same transaction.
 */

/** Explosion depth guard: a deeper product structure indicates a cycle. */
export const MAX_BOM_DEPTH = 10;

export interface BomLineView {
  id: string;
  componentSkuId: string;
  description: string;
  quantity: string;
  scrapPct: string;
  position: number;
}

export interface BomView {
  id: string;
  skuId: string;
  version: number;
  status: RevisionStatus;
  notes: string | null;
  lines: BomLineView[];
}

export interface ExplodedComponent {
  skuId: string;
  description: string;
  quantity: string;
  level: number;
}

export interface RoutingOperationView {
  id: string;
  seq: number;
  name: string;
  workCenter: string;
  setupMinutes: string;
  runMinutesPerUnit: string;
  instructions: string | null;
}

export interface RoutingView {
  id: string;
  skuId: string;
  version: number;
  status: RevisionStatus;
  operations: RoutingOperationView[];
}

export interface EngineeringChangeView {
  id: string;
  ecNumber: string;
  targetSkuId: string;
  title: string;
  status: EcStatus;
  note: string | null;
}

/** Cross-domain contract: SKU identity is owned by PIM. */
export interface SkuInfoGate {
  getSkuInfo(
    tenantId: string,
    skuId: string,
  ): Promise<{ exists: boolean; active: boolean; code: string; name: string } | null>;
}

function bomView(bom: {
  id: string;
  skuId: string;
  version: number;
  status: RevisionStatus;
  notes: string | null;
  lines: Array<{
    id: string;
    componentSkuId: string;
    description: string;
    quantity: { toString(): string };
    scrapPct: { toString(): string };
    position: number;
  }>;
}): BomView {
  return {
    id: bom.id,
    skuId: bom.skuId,
    version: bom.version,
    status: bom.status,
    notes: bom.notes,
    lines: bom.lines
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        id: l.id,
        componentSkuId: l.componentSkuId,
        description: l.description,
        quantity: l.quantity.toString(),
        scrapPct: l.scrapPct.toString(),
        position: l.position,
      })),
  };
}

function routingView(routing: {
  id: string;
  skuId: string;
  version: number;
  status: RevisionStatus;
  operations: Array<{
    id: string;
    seq: number;
    name: string;
    workCenter: string;
    setupMinutes: { toString(): string };
    runMinutesPerUnit: { toString(): string };
    instructions: string | null;
  }>;
}): RoutingView {
  return {
    id: routing.id,
    skuId: routing.skuId,
    version: routing.version,
    status: routing.status,
    operations: routing.operations
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((o) => ({
        id: o.id,
        seq: o.seq,
        name: o.name,
        workCenter: o.workCenter,
        setupMinutes: o.setupMinutes.toString(),
        runMinutesPerUnit: o.runMinutesPerUnit.toString(),
        instructions: o.instructions,
      })),
  };
}

export class EngineeringService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly skus: SkuInfoGate,
  ) {}

  // ------------------------------------------------------------------- BOMs

  async listBoms(skuId: string | undefined, ctx: RequestContext): Promise<BomView[]> {
    const boms = await this.prisma.bom.findMany({
      where: { tenantId: ctx.tenantId, ...(skuId ? { skuId } : {}) },
      include: { lines: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return boms.map(bomView);
  }

  async getBom(bomId: string, ctx: RequestContext): Promise<BomView> {
    const bom = await this.prisma.bom.findFirst({
      where: { id: bomId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!bom) throw notFound('Bom', bomId);
    return bomView(bom);
  }

  /** Creates the next DRAFT version for the SKU (ENG-001). */
  async createBom(
    input: { skuId: string; notes?: string | undefined },
    ctx: RequestContext,
  ): Promise<BomView> {
    const sku = await this.skus.getSkuInfo(ctx.tenantId, input.skuId);
    if (!sku || !sku.exists) throw notFound('Sku', input.skuId);
    const openDraft = await this.prisma.bom.findFirst({
      where: { tenantId: ctx.tenantId, skuId: input.skuId, status: 'DRAFT' },
    });
    if (openDraft) {
      throw new DomainError('CONFLICT', `A draft BOM (v${openDraft.version}) already exists`);
    }
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.bom.findFirst({
        where: { tenantId: ctx.tenantId, skuId: input.skuId },
        orderBy: [{ version: 'desc' }],
      });
      const bom = await tx.bom.create({
        data: {
          tenantId: ctx.tenantId,
          skuId: input.skuId,
          version: (latest?.version ?? 0) + 1,
          notes: input.notes ?? null,
          createdBy: ctx.userId ?? null,
        },
        include: { lines: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'eng.bom.create',
        objectType: 'Bom',
        objectId: bom.id,
        source: 'api',
        newValues: { skuId: bom.skuId, version: bom.version },
      });
      return bomView(bom);
    });
  }

  /** Adds a component line to a DRAFT BOM; refuses direct/indirect cycles. */
  async addBomLine(
    input: {
      bomId: string;
      componentSkuId: string;
      quantity: number;
      scrapPct?: number | undefined;
    },
    ctx: RequestContext,
  ): Promise<BomView> {
    if (!(input.quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    const scrapPct = input.scrapPct ?? 0;
    if (scrapPct < 0 || scrapPct > 100) {
      throw new DomainError('VALIDATION_FAILED', 'Scrap must be between 0 and 100');
    }
    const bom = await this.prisma.bom.findFirst({
      where: { id: input.bomId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!bom) throw notFound('Bom', input.bomId);
    if (bom.status !== 'DRAFT') {
      throw new DomainError('INVALID_STATE', 'Lines can only change while the BOM is a draft');
    }
    if (input.componentSkuId === bom.skuId) {
      throw new DomainError('VALIDATION_FAILED', 'A SKU cannot contain itself');
    }
    const sku = await this.skus.getSkuInfo(ctx.tenantId, input.componentSkuId);
    if (!sku || !sku.exists) throw notFound('Sku', input.componentSkuId);
    if (!sku.active) throw new DomainError('INVALID_STATE', 'Component SKU is not active');

    // Cycle guard: the component's released structure must not contain
    // this BOM's output SKU at any level.
    const reachable = await this.collectReachableSkus(input.componentSkuId, ctx);
    if (reachable.has(bom.skuId)) {
      throw new DomainError('VALIDATION_FAILED', 'Adding this component would create a BOM cycle');
    }

    await this.prisma.bomLine.create({
      data: {
        tenantId: ctx.tenantId,
        bomId: bom.id,
        componentSkuId: input.componentSkuId,
        description: `${sku.code} — ${sku.name}`,
        quantity: input.quantity,
        scrapPct,
        position: bom.lines.length,
      },
    });
    return this.getBom(bom.id, ctx);
  }

  /**
   * DRAFT -> RELEASED (ENG-006): exactly one released revision per SKU —
   * the previous one flips to OBSOLETE in the same transaction.
   */
  async releaseBom(bomId: string, ctx: RequestContext): Promise<BomView> {
    const bom = await this.prisma.bom.findFirst({
      where: { id: bomId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!bom) throw notFound('Bom', bomId);
    if (bom.lines.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'A BOM needs at least one component');
    }
    await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.bom.updateMany({
        where: { id: bom.id, tenantId: ctx.tenantId, status: 'DRAFT' },
        data: { status: 'RELEASED', effectiveFrom: new Date() },
      });
      if (flipped.count === 0) throw new DomainError('INVALID_STATE', 'BOM is not a draft');
      await tx.bom.updateMany({
        where: {
          tenantId: ctx.tenantId,
          skuId: bom.skuId,
          status: 'RELEASED',
          id: { not: bom.id },
        },
        data: { status: 'OBSOLETE' },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'eng.bom.release',
        objectType: 'Bom',
        objectId: bom.id,
        source: 'api',
        newValues: { skuId: bom.skuId, version: bom.version },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.BOM_REVISION_RELEASED,
        aggregateType: 'Bom',
        aggregateId: bom.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { bomId: bom.id, skuId: bom.skuId, version: bom.version },
      });
    });
    return this.getBom(bom.id, ctx);
  }

  /** The currently effective (RELEASED) BOM for a SKU, if any. */
  async getEffectiveBom(skuId: string, ctx: RequestContext): Promise<BomView | null> {
    const bom = await this.prisma.bom.findFirst({
      where: { tenantId: ctx.tenantId, skuId, status: 'RELEASED' },
      include: { lines: true },
    });
    return bom ? bomView(bom) : null;
  }

  /**
   * Deterministic multi-level explosion (the formula engine core):
   * quantities multiply down the released structure, scrap inflates
   * requirements, and depth is bounded (MAX_BOM_DEPTH).
   */
  async explodeBom(
    skuId: string,
    quantity: number,
    ctx: RequestContext,
  ): Promise<ExplodedComponent[]> {
    if (!(quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    const result: ExplodedComponent[] = [];
    const walk = async (parentSkuId: string, parentQty: number, level: number): Promise<void> => {
      if (level > MAX_BOM_DEPTH) {
        throw new DomainError('VALIDATION_FAILED', 'BOM structure exceeds the maximum depth');
      }
      const bom = await this.prisma.bom.findFirst({
        where: { tenantId: ctx.tenantId, skuId: parentSkuId, status: 'RELEASED' },
        include: { lines: true },
      });
      if (!bom) return;
      for (const line of bom.lines.slice().sort((a, b) => a.position - b.position)) {
        const gross = parentQty * Number(line.quantity) * (1 + Number(line.scrapPct) / 100);
        const rounded = Math.round(gross * 1e6) / 1e6;
        result.push({
          skuId: line.componentSkuId,
          description: line.description,
          quantity: rounded.toString(),
          level,
        });
        await walk(line.componentSkuId, rounded, level + 1);
      }
    };
    await walk(skuId, quantity, 1);
    return result;
  }

  // --------------------------------------------------------------- routings

  async listRoutings(skuId: string | undefined, ctx: RequestContext): Promise<RoutingView[]> {
    const routings = await this.prisma.routing.findMany({
      where: { tenantId: ctx.tenantId, ...(skuId ? { skuId } : {}) },
      include: { operations: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return routings.map(routingView);
  }

  async createRouting(input: { skuId: string }, ctx: RequestContext): Promise<RoutingView> {
    const sku = await this.skus.getSkuInfo(ctx.tenantId, input.skuId);
    if (!sku || !sku.exists) throw notFound('Sku', input.skuId);
    const openDraft = await this.prisma.routing.findFirst({
      where: { tenantId: ctx.tenantId, skuId: input.skuId, status: 'DRAFT' },
    });
    if (openDraft) {
      throw new DomainError('CONFLICT', `A draft routing (v${openDraft.version}) already exists`);
    }
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.routing.findFirst({
        where: { tenantId: ctx.tenantId, skuId: input.skuId },
        orderBy: [{ version: 'desc' }],
      });
      const routing = await tx.routing.create({
        data: {
          tenantId: ctx.tenantId,
          skuId: input.skuId,
          version: (latest?.version ?? 0) + 1,
          createdBy: ctx.userId ?? null,
        },
        include: { operations: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'eng.routing.create',
        objectType: 'Routing',
        objectId: routing.id,
        source: 'api',
        newValues: { skuId: routing.skuId, version: routing.version },
      });
      return routingView(routing);
    });
  }

  async addOperation(
    input: {
      routingId: string;
      name: string;
      workCenter: string;
      setupMinutes?: number | undefined;
      runMinutesPerUnit?: number | undefined;
      instructions?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<RoutingView> {
    const routing = await this.prisma.routing.findFirst({
      where: { id: input.routingId, tenantId: ctx.tenantId },
      include: { operations: true },
    });
    if (!routing) throw notFound('Routing', input.routingId);
    if (routing.status !== 'DRAFT') {
      throw new DomainError(
        'INVALID_STATE',
        'Operations can only change while the routing is a draft',
      );
    }
    const setup = input.setupMinutes ?? 0;
    const run = input.runMinutesPerUnit ?? 0;
    if (setup < 0 || run < 0) {
      throw new DomainError('VALIDATION_FAILED', 'Times cannot be negative');
    }
    const nextSeq = routing.operations.reduce((max, o) => Math.max(max, o.seq), 0) + 10;
    await this.prisma.routingOperation.create({
      data: {
        tenantId: ctx.tenantId,
        routingId: routing.id,
        seq: nextSeq,
        name: input.name,
        workCenter: input.workCenter,
        setupMinutes: setup,
        runMinutesPerUnit: run,
        instructions: input.instructions ?? null,
      },
    });
    const fresh = await this.prisma.routing.findFirst({
      where: { id: routing.id, tenantId: ctx.tenantId },
      include: { operations: true },
    });
    return routingView(fresh!);
  }

  async releaseRouting(routingId: string, ctx: RequestContext): Promise<RoutingView> {
    const routing = await this.prisma.routing.findFirst({
      where: { id: routingId, tenantId: ctx.tenantId },
      include: { operations: true },
    });
    if (!routing) throw notFound('Routing', routingId);
    if (routing.operations.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'A routing needs at least one operation');
    }
    await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.routing.updateMany({
        where: { id: routing.id, tenantId: ctx.tenantId, status: 'DRAFT' },
        data: { status: 'RELEASED' },
      });
      if (flipped.count === 0) throw new DomainError('INVALID_STATE', 'Routing is not a draft');
      await tx.routing.updateMany({
        where: {
          tenantId: ctx.tenantId,
          skuId: routing.skuId,
          status: 'RELEASED',
          id: { not: routing.id },
        },
        data: { status: 'OBSOLETE' },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.ROUTING_REVISION_RELEASED,
        aggregateType: 'Routing',
        aggregateId: routing.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { routingId: routing.id, skuId: routing.skuId, version: routing.version },
      });
    });
    const fresh = await this.prisma.routing.findFirst({
      where: { id: routing.id, tenantId: ctx.tenantId },
      include: { operations: true },
    });
    return routingView(fresh!);
  }

  /** Standard time roll-up for a quantity (ENG-013), in minutes. */
  async standardTime(
    skuId: string,
    quantity: number,
    ctx: RequestContext,
  ): Promise<{ totalMinutes: string; operations: number }> {
    if (!(quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    const routing = await this.prisma.routing.findFirst({
      where: { tenantId: ctx.tenantId, skuId, status: 'RELEASED' },
      include: { operations: true },
    });
    if (!routing) throw notFound('Released routing for SKU', skuId);
    const total = routing.operations.reduce(
      (sum, o) => sum + Number(o.setupMinutes) + Number(o.runMinutesPerUnit) * quantity,
      0,
    );
    return {
      totalMinutes: (Math.round(total * 100) / 100).toString(),
      operations: routing.operations.length,
    };
  }

  // ---------------------------------------------------- engineering changes

  async listChanges(ctx: RequestContext): Promise<EngineeringChangeView[]> {
    const rows = await this.prisma.engineeringChange.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      ecNumber: r.ecNumber,
      targetSkuId: r.targetSkuId,
      title: r.title,
      status: r.status,
      note: r.note,
    }));
  }

  async requestChange(
    input: { targetSkuId: string; title: string; note?: string | undefined },
    ctx: RequestContext,
  ): Promise<EngineeringChangeView> {
    const sku = await this.skus.getSkuInfo(ctx.tenantId, input.targetSkuId);
    if (!sku || !sku.exists) throw notFound('Sku', input.targetSkuId);
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.engineeringChange.count({ where: { tenantId: ctx.tenantId } });
      const change = await tx.engineeringChange.create({
        data: {
          tenantId: ctx.tenantId,
          ecNumber: `EC-${String(count + 1).padStart(5, '0')}`,
          targetSkuId: input.targetSkuId,
          title: input.title,
          note: input.note ?? null,
          createdBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'eng.change.request',
        objectType: 'EngineeringChange',
        objectId: change.id,
        source: 'api',
        newValues: { ecNumber: change.ecNumber, title: change.title },
      });
      return {
        id: change.id,
        ecNumber: change.ecNumber,
        targetSkuId: change.targetSkuId,
        title: change.title,
        status: change.status,
        note: change.note,
      };
    });
  }

  /** OPEN -> APPROVED/REJECTED; the requester cannot decide their own EC. */
  async decideChange(
    changeId: string,
    approved: boolean,
    ctx: RequestContext,
  ): Promise<EngineeringChangeView> {
    const change = await this.prisma.engineeringChange.findFirst({
      where: { id: changeId, tenantId: ctx.tenantId },
    });
    if (!change) throw notFound('EngineeringChange', changeId);
    if (ctx.userId && change.createdBy && ctx.userId === change.createdBy) {
      throw new DomainError('FORBIDDEN', 'The requester cannot decide their own change');
    }
    const flipped = await this.prisma.engineeringChange.updateMany({
      where: { id: change.id, tenantId: ctx.tenantId, status: 'OPEN' },
      data: { status: approved ? 'APPROVED' : 'REJECTED', decidedBy: ctx.userId ?? null },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', 'Change is already decided');
    }
    if (approved) {
      await this.prisma.$transaction(async (tx) => {
        await publishToOutbox(tx, {
          tenantId: ctx.tenantId,
          eventType: EVENT_TYPES.ENGINEERING_CHANGE_APPROVED,
          aggregateType: 'EngineeringChange',
          aggregateId: change.id,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          payload: { changeId: change.id, ecNumber: change.ecNumber },
        });
      });
    }
    const fresh = await this.prisma.engineeringChange.findFirst({
      where: { id: change.id, tenantId: ctx.tenantId },
    });
    return {
      id: fresh!.id,
      ecNumber: fresh!.ecNumber,
      targetSkuId: fresh!.targetSkuId,
      title: fresh!.title,
      status: fresh!.status,
      note: fresh!.note,
    };
  }

  /** All SKUs reachable from a SKU through released BOMs (cycle guard). */
  private async collectReachableSkus(skuId: string, ctx: RequestContext): Promise<Set<string>> {
    const seen = new Set<string>();
    const queue = [skuId];
    let depth = 0;
    while (queue.length > 0 && depth < MAX_BOM_DEPTH) {
      const batch = queue.splice(0, queue.length);
      depth += 1;
      for (const current of batch) {
        const boms = await this.prisma.bom.findMany({
          where: { tenantId: ctx.tenantId, skuId: current, status: { in: ['DRAFT', 'RELEASED'] } },
          include: { lines: true },
        });
        for (const bom of boms) {
          for (const line of bom.lines) {
            if (!seen.has(line.componentSkuId)) {
              seen.add(line.componentSkuId);
              queue.push(line.componentSkuId);
            }
          }
        }
      }
    }
    return seen;
  }
}

import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Container / import tracking (PROC-010). Inbound logistics containers
 * move through a fixed forward-only lifecycle; every step is audited,
 * so the history is the audit trail. Optionally linked to the purchase
 * order they carry.
 */

export type ContainerStatus =
  'BOOKED' | 'AT_ORIGIN' | 'ON_WATER' | 'AT_PORT' | 'CUSTOMS' | 'DELIVERED';

const ORDER: ContainerStatus[] = [
  'BOOKED',
  'AT_ORIGIN',
  'ON_WATER',
  'AT_PORT',
  'CUSTOMS',
  'DELIVERED',
];

const NUMBER_RE = /^[A-Z]{4}\d{7}$/;

export interface ContainerView {
  id: string;
  containerNumber: string;
  poId: string | null;
  poNumber: string | null;
  carrier: string | null;
  status: ContainerStatus;
  eta: string | null;
  notes: string | null;
}

export class ContainerService {
  constructor(private readonly prisma: PrismaClient) {}

  private async toView(row: {
    id: string;
    tenantId: string;
    containerNumber: string;
    poId: string | null;
    carrier: string | null;
    status: string;
    eta: Date | null;
    notes: string | null;
  }): Promise<ContainerView> {
    let poNumber: string | null = null;
    if (row.poId) {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: row.poId, tenantId: row.tenantId },
        select: { poNumber: true },
      });
      poNumber = po?.poNumber ?? null;
    }
    return {
      id: row.id,
      containerNumber: row.containerNumber,
      poId: row.poId,
      poNumber,
      carrier: row.carrier,
      status: row.status as ContainerStatus,
      eta: row.eta ? row.eta.toISOString() : null,
      notes: row.notes,
    };
  }

  async listContainers(
    filter: { status?: ContainerStatus | undefined },
    ctx: RequestContext,
  ): Promise<ContainerView[]> {
    const rows = await this.prisma.container.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    return Promise.all(rows.map((r) => this.toView(r)));
  }

  async createContainer(
    input: {
      containerNumber: string;
      poId?: string | undefined;
      carrier?: string | undefined;
      eta?: string | undefined;
      notes?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<ContainerView> {
    const containerNumber = input.containerNumber.trim().toUpperCase();
    if (!NUMBER_RE.test(containerNumber)) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Container number must be 4 letters + 7 digits (ISO 6346)',
      );
    }
    if (input.poId) {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: input.poId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!po) throw notFound('PurchaseOrder', input.poId);
    }
    let eta: Date | undefined;
    if (input.eta !== undefined) {
      eta = new Date(input.eta);
      if (Number.isNaN(eta.getTime())) {
        throw new DomainError('VALIDATION_FAILED', 'Invalid ETA');
      }
    }
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.container.create({
          data: {
            tenantId: ctx.tenantId,
            containerNumber,
            poId: input.poId ?? null,
            carrier: input.carrier ?? null,
            eta: eta ?? null,
            notes: input.notes ?? null,
            createdBy: ctx.userId ?? null,
          },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'proc.container.create',
          objectType: 'Container',
          objectId: created.id,
          source: 'api',
          newValues: { containerNumber, poId: input.poId ?? null },
        });
        return created;
      });
      return this.toView(row);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', `Container ${containerNumber} already exists`);
      }
      throw error;
    }
  }

  /** Forward-only, one step at a time; ETA may be refreshed alongside. */
  async advance(
    containerId: string,
    input: { eta?: string | undefined; notes?: string | undefined },
    ctx: RequestContext,
  ): Promise<ContainerView> {
    const row = await this.prisma.container.findFirst({
      where: { id: containerId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('Container', containerId);
    const index = ORDER.indexOf(row.status as ContainerStatus);
    const next = ORDER[index + 1];
    if (!next) {
      throw new DomainError('INVALID_STATE', 'The container is already delivered');
    }
    let eta: Date | undefined;
    if (input.eta !== undefined) {
      eta = new Date(input.eta);
      if (Number.isNaN(eta.getTime())) {
        throw new DomainError('VALIDATION_FAILED', 'Invalid ETA');
      }
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.container.update({
        where: { id: row.id },
        data: {
          status: next,
          ...(eta ? { eta } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'proc.container.advance',
        objectType: 'Container',
        objectId: row.id,
        source: 'api',
        previousValues: { status: row.status },
        newValues: { status: next, eta: eta ? eta.toISOString() : undefined },
      });
      return changed;
    });
    return this.toView(updated);
  }

  /** Everything not yet delivered, soonest ETA first — the import desk. */
  async inTransit(ctx: RequestContext): Promise<ContainerView[]> {
    const rows = await this.prisma.container.findMany({
      where: { tenantId: ctx.tenantId, status: { not: 'DELIVERED' } },
      orderBy: [{ eta: 'asc' }],
      take: 200,
    });
    return Promise.all(rows.map((r) => this.toView(r)));
  }
}

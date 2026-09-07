import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Packing & shipping staging (WMS-011/012). Confirmed order lines are
 * packed into physical packages; staging and shipping are status
 * flips on the package. Packages never carry stock truth — the ledger
 * does — they carry what goes in which box.
 */

export interface PackageLineView {
  id: string;
  orderLineId: string;
  description: string;
  quantity: string;
}

export interface PackageView {
  id: string;
  packageNumber: string;
  orderId: string;
  orderNumber: string;
  status: string;
  weightKg: string | null;
  lines: PackageLineView[];
}

const TRANSITIONS: Record<string, string[]> = {
  PACKED: ['STAGED'],
  STAGED: ['SHIPPED'],
  SHIPPED: [],
};

export class PackingService {
  constructor(private readonly prisma: PrismaClient) {}

  private async toView(pkg: {
    id: string;
    tenantId: string;
    packageNumber: string;
    orderId: string;
    status: string;
    weightKg: unknown;
  }): Promise<PackageView> {
    const [order, lines] = await Promise.all([
      this.prisma.salesOrder.findFirst({
        where: { id: pkg.orderId, tenantId: pkg.tenantId },
        select: { orderNumber: true },
      }),
      this.prisma.packageLine.findMany({ where: { tenantId: pkg.tenantId, packageId: pkg.id } }),
    ]);
    const orderLines = await this.prisma.salesOrderLine.findMany({
      where: { tenantId: pkg.tenantId, id: { in: lines.map((l) => l.orderLineId) } },
      select: { id: true, description: true },
    });
    const descOf = new Map(orderLines.map((l) => [l.id, l.description]));
    return {
      id: pkg.id,
      packageNumber: pkg.packageNumber,
      orderId: pkg.orderId,
      orderNumber: order?.orderNumber ?? '',
      status: pkg.status,
      weightKg: pkg.weightKg === null ? null : String(pkg.weightKg),
      lines: lines.map((l) => ({
        id: l.id,
        orderLineId: l.orderLineId,
        description: descOf.get(l.orderLineId) ?? '',
        quantity: l.quantity.toString(),
      })),
    };
  }

  async listPackages(
    filter: { orderId?: string | undefined },
    ctx: RequestContext,
  ): Promise<PackageView[]> {
    const rows = await this.prisma.package.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(filter.orderId ? { orderId: filter.orderId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return Promise.all(rows.map((r) => this.toView(r)));
  }

  /**
   * Pack confirmed order lines into a new package. Over-packing is
   * refused: packed quantity across all packages never exceeds the
   * ordered quantity per line.
   */
  async createPackage(
    input: {
      orderId: string;
      lines: Array<{ orderLineId: string; quantity: number }>;
      weightKg?: number | undefined;
    },
    ctx: RequestContext,
  ): Promise<PackageView> {
    if (input.lines.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'A package needs at least one line');
    }
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: input.orderId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!order) throw notFound('SalesOrder', input.orderId);
    if (order.status !== 'CONFIRMED' && order.status !== 'FULFILLED') {
      throw new DomainError('INVALID_STATE', 'Only confirmed orders can be packed');
    }
    const lineOf = new Map(order.lines.map((l) => [l.id, l]));
    // Already-packed quantities per order line.
    const packed = await this.prisma.packageLine.findMany({
      where: {
        tenantId: ctx.tenantId,
        orderLineId: { in: input.lines.map((l) => l.orderLineId) },
      },
      select: { orderLineId: true, quantity: true },
    });
    const packedSum = new Map<string, number>();
    for (const p of packed) {
      packedSum.set(p.orderLineId, (packedSum.get(p.orderLineId) ?? 0) + Number(p.quantity));
    }
    for (const line of input.lines) {
      const orderLine = lineOf.get(line.orderLineId);
      if (!orderLine) throw notFound('SalesOrderLine', line.orderLineId);
      if (!(line.quantity > 0)) {
        throw new DomainError('VALIDATION_FAILED', 'Package line quantity must be positive');
      }
      const already = packedSum.get(line.orderLineId) ?? 0;
      if (already + line.quantity > Number(orderLine.quantity) + 1e-9) {
        throw new DomainError(
          'INVALID_STATE',
          `Line over-packed: ordered ${orderLine.quantity}, already packed ${already}`,
        );
      }
    }
    const count = await this.prisma.package.count({ where: { tenantId: ctx.tenantId } });
    const pkg = await this.prisma.$transaction(async (tx) => {
      const created = await tx.package.create({
        data: {
          tenantId: ctx.tenantId,
          orderId: order.id,
          packageNumber: `PKG-${String(count + 1).padStart(6, '0')}`,
          ...(input.weightKg !== undefined ? { weightKg: input.weightKg } : {}),
          ...(ctx.userId !== undefined ? { createdBy: ctx.userId } : {}),
        },
      });
      for (const line of input.lines) {
        await tx.packageLine.create({
          data: {
            tenantId: ctx.tenantId,
            packageId: created.id,
            orderLineId: line.orderLineId,
            quantity: line.quantity,
          },
        });
      }
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'wms.package.create',
        objectType: 'Package',
        objectId: created.id,
        source: 'api',
        newValues: { orderId: order.id, lines: input.lines.length },
      });
      return created;
    });
    return this.toView(pkg);
  }

  /** PACKED → STAGED → SHIPPED, audited each step. */
  async transition(
    packageId: string,
    to: 'STAGED' | 'SHIPPED',
    ctx: RequestContext,
  ): Promise<PackageView> {
    const pkg = await this.prisma.package.findFirst({
      where: { id: packageId, tenantId: ctx.tenantId },
    });
    if (!pkg) throw notFound('Package', packageId);
    if (!(TRANSITIONS[pkg.status] ?? []).includes(to)) {
      throw new DomainError('INVALID_STATE', `Cannot move a ${pkg.status} package to ${to}`);
    }
    const updated = await this.prisma.package.update({
      where: { id: pkg.id },
      data: { status: to },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'wms.package.transition',
      objectType: 'Package',
      objectId: pkg.id,
      source: 'api',
      previousValues: { status: pkg.status },
      newValues: { status: to },
    });
    return this.toView(updated);
  }
}

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
  ssccCode: string | null;
  lines: PackageLineView[];
}

const TRANSITIONS: Record<string, string[]> = {
  PACKED: ['STAGED'],
  STAGED: ['SHIPPED'],
  SHIPPED: [],
};

/** Cross-domain contract: tenant configuration (owned by core). */
export interface PackingConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
}

/** GS1 mod-10 check digit over the first 17 SSCC digits. */
export function ssccCheckDigit(digits17: string): number {
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const n = Number(digits17[i]);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10;
}

export class PackingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration?: PackingConfigGate,
  ) {}

  private async toView(pkg: {
    id: string;
    tenantId: string;
    packageNumber: string;
    orderId: string;
    status: string;
    weightKg: unknown;
    ssccCode: string | null;
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
      ssccCode: pkg.ssccCode,
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

  /**
   * WMS-020 — assign a GS1 SSCC-18 to a package: extension digit '0' +
   * company prefix (config `wms.gs1CompanyPrefix`, digits, default
   * 9999999) + serial reference from the package number sequence +
   * mod-10 check digit. Idempotent: an assigned code never changes.
   */
  async assignSscc(packageId: string, ctx: RequestContext): Promise<PackageView> {
    const pkg = await this.prisma.package.findFirst({
      where: { id: packageId, tenantId: ctx.tenantId },
    });
    if (!pkg) throw notFound('Package', packageId);
    if (pkg.ssccCode) return this.toView(pkg);
    if (pkg.status === 'SHIPPED') {
      throw new DomainError('INVALID_STATE', 'Cannot label a package that already shipped');
    }
    let prefix = '9999999';
    if (this.configuration) {
      const { config } = await this.configuration.getEffectiveConfiguration(ctx.tenantId);
      const wms = ((config as Record<string, unknown>).wms ?? {}) as Record<string, unknown>;
      const configured = String(wms.gs1CompanyPrefix ?? '').replace(/\D/g, '');
      if (configured.length >= 4 && configured.length <= 12) prefix = configured;
    }
    const serialDigits = 16 - prefix.length;
    const serial = pkg.packageNumber.replace(/\D/g, '');
    if (serial.length > serialDigits) {
      throw new DomainError('VALIDATION_FAILED', 'GS1 company prefix leaves no serial capacity');
    }
    const body = `0${prefix}${serial.padStart(serialDigits, '0')}`;
    const sscc = `${body}${ssccCheckDigit(body)}`;
    const updated = await this.prisma.package.update({
      where: { id: pkg.id },
      data: { ssccCode: sscc },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'wms.package.sscc',
      objectType: 'Package',
      objectId: pkg.id,
      source: 'api',
      newValues: { ssccCode: sscc },
    });
    return this.toView(updated);
  }
}

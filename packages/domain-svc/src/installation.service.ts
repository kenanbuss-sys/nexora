import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Installation and site measurement visits for made-to-order work
 * (Sprint 248). A visit is a service order of kind MEASUREMENT or
 * INSTALLATION; an installation belongs to a sales order (at most one
 * open per order — unique index). Scheduling books a time slot with a
 * CREW (HCM employees) and a VEHICLE (LOG); a person or a vehicle cannot
 * be in two overlapping slots (checked under a per-tenant lock).
 */

export interface InstallOrderGate {
  orderContext(
    tenantId: string,
    orderId: string,
  ): Promise<{
    id: string;
    orderNumber: string;
    accountId: string;
    status: string;
    lines: Array<{ id: string; description: string; spec?: unknown }>;
  } | null>;
}

export interface VisitView {
  id: string;
  orderNumber: string;
  kind: string;
  status: string;
  accountId: string;
  salesOrderId: string | null;
  quoteId: string | null;
  siteAddress: string | null;
  slotStart: string | null;
  slotEnd: string | null;
  crewEmployeeIds: string[];
  vehicleId: string | null;
  report: string | null;
}

const OPEN = ['PLANNED', 'SCHEDULED', 'IN_PROGRESS'];

function view(o: {
  id: string;
  orderNumber: string;
  kind: string;
  status: string;
  accountId: string;
  salesOrderId: string | null;
  quoteId: string | null;
  siteAddress: string | null;
  slotStart: Date | null;
  slotEnd: Date | null;
  crewEmployeeIds: string[];
  vehicleId: string | null;
  report: string | null;
}): VisitView {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    kind: o.kind,
    status: o.status,
    accountId: o.accountId,
    salesOrderId: o.salesOrderId,
    quoteId: o.quoteId,
    siteAddress: o.siteAddress,
    slotStart: o.slotStart?.toISOString() ?? null,
    slotEnd: o.slotEnd?.toISOString() ?? null,
    crewEmployeeIds: o.crewEmployeeIds,
    vehicleId: o.vehicleId,
    report: o.report,
  };
}

export class InstallationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly orders: InstallOrderGate,
  ) {}

  private async nextNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const key = `svc.order.number:${tenantId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const count = await tx.serviceOrder.count({ where: { tenantId } });
    return `SVO-${String(count + 1).padStart(6, '0')}`;
  }

  /**
   * Permission: service.manage. Site measurement visit for a customer
   * (optionally tied to the quote it feeds).
   */
  async createMeasurement(
    input: {
      accountId: string;
      siteAddress?: string | undefined;
      quoteId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<VisitView> {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: input.accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw notFound('CrmAccount', input.accountId);
    if (input.quoteId) {
      const quote = await this.prisma.quote.findFirst({
        where: { id: input.quoteId, tenantId: ctx.tenantId, accountId: account.id },
      });
      if (!quote) throw notFound('Quote', input.quoteId);
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.nextNumber(tx, ctx.tenantId);
      const row = await tx.serviceOrder.create({
        data: {
          tenantId: ctx.tenantId,
          orderNumber,
          kind: 'MEASUREMENT',
          accountId: account.id,
          quoteId: input.quoteId ?? null,
          siteAddress: input.siteAddress?.trim() || null,
          createdBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'svc.measurement.create',
        objectType: 'ServiceOrder',
        objectId: row.id,
        source: 'api',
        newValues: { orderNumber, accountId: account.id },
      });
      return row;
    });
    return view(created);
  }

  /**
   * Permission: service.manage. The installation visit of a confirmed
   * sales order — idempotent: the open one is returned if it exists.
   */
  async createInstallation(
    input: { salesOrderId: string; siteAddress?: string | undefined },
    ctx: RequestContext,
  ): Promise<VisitView & { duplicate: boolean }> {
    const order = await this.orders.orderContext(ctx.tenantId, input.salesOrderId);
    if (!order) throw notFound('SalesOrder', input.salesOrderId);
    if (!['CONFIRMED', 'ON_HOLD', 'FULFILLED'].includes(order.status)) {
      throw new DomainError(
        'INVALID_STATE',
        `An installation needs a confirmed order (is ${order.status})`,
      );
    }
    const existing = await this.prisma.serviceOrder.findFirst({
      where: {
        tenantId: ctx.tenantId,
        salesOrderId: order.id,
        kind: 'INSTALLATION',
        status: { not: 'CANCELLED' },
      },
    });
    if (existing) return { ...view(existing), duplicate: true };
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const orderNumber = await this.nextNumber(tx, ctx.tenantId);
        const row = await tx.serviceOrder.create({
          data: {
            tenantId: ctx.tenantId,
            orderNumber,
            kind: 'INSTALLATION',
            accountId: order.accountId,
            salesOrderId: order.id,
            siteAddress: input.siteAddress?.trim() || null,
            report: `Montaža za narudžbu ${order.orderNumber}`,
            createdBy: ctx.userId ?? null,
          },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'svc.installation.create',
          objectType: 'ServiceOrder',
          objectId: row.id,
          source: 'api',
          newValues: { orderNumber, salesOrderId: order.id },
        });
        return row;
      });
      return { ...view(created), duplicate: false };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const winner = await this.prisma.serviceOrder.findFirst({
          where: {
            tenantId: ctx.tenantId,
            salesOrderId: order.id,
            kind: 'INSTALLATION',
            status: { not: 'CANCELLED' },
          },
        });
        if (winner) return { ...view(winner), duplicate: true };
      }
      throw error;
    }
  }

  /**
   * Permission: service.manage. Books the visit's slot with a crew and a
   * vehicle. Every crew member must be an ACTIVE employee, the vehicle
   * active; nobody and no vehicle may be in another open overlapping slot.
   */
  async scheduleVisit(
    visitId: string,
    input: {
      slotStart: string;
      slotEnd: string;
      crewEmployeeIds: string[];
      vehicleId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<VisitView> {
    const start = new Date(input.slotStart);
    const end = new Date(input.slotEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !(end > start)) {
      throw new DomainError('VALIDATION_FAILED', 'The slot needs a start before its end');
    }
    if (end.getTime() - start.getTime() > 14 * 3600_000) {
      throw new DomainError('VALIDATION_FAILED', 'A slot is at most 14 hours');
    }
    const crew = [...new Set(input.crewEmployeeIds.map((c) => c.toLowerCase()))];
    if (crew.length < 1 || crew.length > 10) {
      throw new DomainError('VALIDATION_FAILED', 'A crew has 1-10 people');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      // One lock per tenant schedule: overlap checks and the booking are atomic.
      const key = `svc.schedule:${ctx.tenantId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      const visit = await tx.serviceOrder.findFirst({
        where: { id: visitId, tenantId: ctx.tenantId },
      });
      if (!visit) throw notFound('ServiceOrder', visitId);
      if (!['PLANNED', 'SCHEDULED'].includes(visit.status)) {
        throw new DomainError('INVALID_STATE', `Cannot schedule a ${visit.status} visit`);
      }
      const employees = await tx.employee.findMany({
        where: { tenantId: ctx.tenantId, id: { in: crew } },
        select: { id: true, status: true, name: true },
      });
      const missing = crew.filter((c) => !employees.some((e) => e.id === c));
      if (missing.length > 0) throw notFound('Employee', missing.join(','));
      const inactive = employees.filter((e) => e.status !== 'ACTIVE').map((e) => e.name);
      if (inactive.length > 0) {
        throw new DomainError('INVALID_STATE', `Not active: ${inactive.join(', ')}`);
      }
      if (input.vehicleId) {
        const vehicle = await tx.vehicle.findFirst({
          where: { id: input.vehicleId, tenantId: ctx.tenantId },
        });
        if (!vehicle) throw notFound('Vehicle', input.vehicleId);
        if (!vehicle.active) throw new DomainError('INVALID_STATE', 'The vehicle is not active');
      }
      const overlapping = await tx.serviceOrder.findMany({
        where: {
          tenantId: ctx.tenantId,
          id: { not: visit.id },
          status: { in: OPEN },
          slotStart: { lt: end },
          slotEnd: { gt: start },
        },
        select: { orderNumber: true, crewEmployeeIds: true, vehicleId: true },
      });
      for (const other of overlapping) {
        const busy = other.crewEmployeeIds.filter((c) => crew.includes(c));
        if (busy.length > 0) {
          const names = employees.filter((e) => busy.includes(e.id)).map((e) => e.name);
          throw new DomainError(
            'CONFLICT',
            `${names.join(', ')} already booked on ${other.orderNumber} in this slot`,
            { conflictingOrder: other.orderNumber },
          );
        }
        if (input.vehicleId && other.vehicleId === input.vehicleId) {
          throw new DomainError(
            'CONFLICT',
            `The vehicle is already booked on ${other.orderNumber} in this slot`,
            { conflictingOrder: other.orderNumber },
          );
        }
      }
      const row = await tx.serviceOrder.update({
        where: { id: visit.id },
        data: {
          status: 'SCHEDULED',
          slotStart: start,
          slotEnd: end,
          scheduledAt: start,
          crewEmployeeIds: crew,
          assignedTo: crew[0] ?? null,
          vehicleId: input.vehicleId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'svc.visit.schedule',
        objectType: 'ServiceOrder',
        objectId: visit.id,
        source: 'api',
        previousValues: {
          slotStart: visit.slotStart?.toISOString() ?? null,
          crew: visit.crewEmployeeIds,
          vehicleId: visit.vehicleId,
        },
        newValues: {
          slotStart: start.toISOString(),
          slotEnd: end.toISOString(),
          crew,
          vehicleId: input.vehicleId ?? null,
        },
      });
      return row;
    });
    return view(updated);
  }

  /**
   * Permission: service.read. Visits with a slot in [from, to), crew and
   * vehicle resolved to names — the week board for dispatch and crews.
   */
  async schedule(range: { from: Date; to: Date; kind?: string | undefined }, ctx: RequestContext) {
    if (!(range.to > range.from) || range.to.getTime() - range.from.getTime() > 62 * 86_400_000) {
      throw new DomainError('VALIDATION_FAILED', 'Range must be 1-62 days');
    }
    const visits = await this.prisma.serviceOrder.findMany({
      where: {
        tenantId: ctx.tenantId,
        slotStart: { gte: range.from, lt: range.to },
        status: { not: 'CANCELLED' },
        ...(range.kind ? { kind: range.kind } : {}),
      },
      orderBy: { slotStart: 'asc' },
      take: 1000,
    });
    const employeeIds = [...new Set(visits.flatMap((v) => v.crewEmployeeIds))];
    const vehicleIds = [...new Set(visits.map((v) => v.vehicleId).filter((v): v is string => !!v))];
    const accountIds = [...new Set(visits.map((v) => v.accountId))];
    const [employees, vehicles, accounts] = await Promise.all([
      this.prisma.employee.findMany({
        where: { tenantId: ctx.tenantId, id: { in: employeeIds } },
        select: { id: true, name: true },
      }),
      this.prisma.vehicle.findMany({
        where: { tenantId: ctx.tenantId, id: { in: vehicleIds } },
        select: { id: true, plate: true, name: true },
      }),
      this.prisma.crmAccount.findMany({
        where: { tenantId: ctx.tenantId, id: { in: accountIds } },
        select: { id: true, accountNumber: true, partyId: true },
      }),
    ]);
    const parties = await this.prisma.party.findMany({
      where: { tenantId: ctx.tenantId, id: { in: accounts.map((a) => a.partyId) } },
      select: { id: true, name: true },
    });
    const accountName = new Map(
      accounts.map((a) => [a.id, parties.find((p) => p.id === a.partyId)?.name ?? a.accountNumber]),
    );
    return visits.map((v) => ({
      ...view(v),
      customer: accountName.get(v.accountId) ?? null,
      crew: v.crewEmployeeIds.map((id) => ({
        id,
        name: employees.find((e) => e.id === id)?.name ?? null,
      })),
      vehicle: vehicles.find((x) => x.id === v.vehicleId) ?? null,
    }));
  }

  /**
   * Permission: service.read. Open visits WITHOUT a slot yet (the
   * dispatcher's "to schedule" list), newest first, with customer names.
   */
  async unscheduled(kind: string | undefined, ctx: RequestContext) {
    const rows = await this.prisma.serviceOrder.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'PLANNED',
        slotStart: null,
        ...(kind ? { kind } : { kind: { in: ['MEASUREMENT', 'INSTALLATION'] } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const accounts = await this.prisma.crmAccount.findMany({
      where: { tenantId: ctx.tenantId, id: { in: [...new Set(rows.map((r) => r.accountId))] } },
      select: { id: true, accountNumber: true, partyId: true },
    });
    const parties = await this.prisma.party.findMany({
      where: { tenantId: ctx.tenantId, id: { in: accounts.map((a) => a.partyId) } },
      select: { id: true, name: true },
    });
    return rows.map((r) => {
      const account = accounts.find((a) => a.id === r.accountId);
      return {
        ...view(r),
        customer: account
          ? (parties.find((p) => p.id === account.partyId)?.name ?? account.accountNumber)
          : null,
      };
    });
  }

  /** Permission: service.read. Visits of one sales order (installation + others). */
  async forSalesOrder(salesOrderId: string, ctx: RequestContext): Promise<VisitView[]> {
    const rows = await this.prisma.serviceOrder.findMany({
      where: { tenantId: ctx.tenantId, salesOrderId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(view);
  }
}

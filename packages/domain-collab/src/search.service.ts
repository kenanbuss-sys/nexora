import type { PrismaClient } from '@nexora/db';
import { DomainError } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Global search (CORE-011): one query fans out over the record families
 * people actually look for — parties, products, SKUs, quotes, orders,
 * purchase orders, work orders and invoices. Every branch is tenant-
 * scoped read-only, capped per family and merged into typed hits the
 * shell can route.
 */

export interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const PER_FAMILY = 5;

export class SearchService {
  constructor(private readonly prisma: PrismaClient) {}

  async search(term: string, ctx: RequestContext): Promise<SearchHit[]> {
    const q = term.trim();
    if (q.length < 2) {
      throw new DomainError('VALIDATION_FAILED', 'Search needs at least 2 characters');
    }
    const tenantId = ctx.tenantId;
    const contains = { contains: q, mode: 'insensitive' as const };

    const [parties, products, skus, quotes, orders, purchaseOrders, workOrders, invoices] =
      await Promise.all([
        this.prisma.party.findMany({
          where: { tenantId, status: { not: 'MERGED' }, OR: [{ name: contains }] },
          take: PER_FAMILY,
        }),
        this.prisma.product.findMany({
          where: { tenantId, OR: [{ code: contains }, { name: contains }] },
          take: PER_FAMILY,
        }),
        this.prisma.sku.findMany({
          where: { tenantId, OR: [{ code: contains }, { name: contains }] },
          take: PER_FAMILY,
        }),
        this.prisma.quote.findMany({
          where: { tenantId, quoteNumber: contains },
          take: PER_FAMILY,
          orderBy: { version: 'desc' },
        }),
        this.prisma.salesOrder.findMany({
          where: { tenantId, orderNumber: contains },
          take: PER_FAMILY,
        }),
        this.prisma.purchaseOrder.findMany({
          where: { tenantId, poNumber: contains },
          take: PER_FAMILY,
        }),
        this.prisma.workOrder.findMany({
          where: { tenantId, woNumber: contains },
          take: PER_FAMILY,
        }),
        this.prisma.invoice.findMany({
          where: { tenantId, invoiceNumber: contains },
          take: PER_FAMILY,
        }),
      ]);

    const hits: SearchHit[] = [
      ...parties.map((p) => ({
        type: 'party',
        id: p.id,
        title: p.name,
        subtitle: p.partyType,
        href: '/parties',
      })),
      ...products.map((p) => ({
        type: 'product',
        id: p.id,
        title: p.name,
        subtitle: p.code,
        href: '/catalog',
      })),
      ...skus.map((s) => ({
        type: 'sku',
        id: s.id,
        title: s.name,
        subtitle: s.code,
        href: '/catalog',
      })),
      ...quotes.map((qu) => ({
        type: 'quote',
        id: qu.id,
        title: qu.quoteNumber,
        subtitle: `v${qu.version} · ${qu.status}`,
        href: '/quotes',
      })),
      ...orders.map((o) => ({
        type: 'sales_order',
        id: o.id,
        title: o.orderNumber,
        subtitle: o.status,
        href: '/orders',
      })),
      ...purchaseOrders.map((po) => ({
        type: 'purchase_order',
        id: po.id,
        title: po.poNumber,
        subtitle: po.status,
        href: '/procurement',
      })),
      ...workOrders.map((wo) => ({
        type: 'work_order',
        id: wo.id,
        title: wo.woNumber,
        subtitle: wo.status,
        href: '/production',
      })),
      ...invoices.map((inv) => ({
        type: 'invoice',
        id: inv.id,
        title: inv.invoiceNumber,
        subtitle: `${inv.invoiceType} · ${inv.status}`,
        href: '/finance',
      })),
    ];
    return hits.slice(0, 40);
  }
}

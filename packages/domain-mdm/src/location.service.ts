import type { PrismaClient } from '@nexora/db';
import { notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Location master (MDM-003). One governed registry of the business's
 * physical sites — branches, factories and warehouses — read from the
 * owning structures (organization and WMS), never duplicated: master
 * data stays a view over single sources of truth.
 */

export type SiteKind = 'BRANCH' | 'FACTORY' | 'WAREHOUSE';

export interface SiteView {
  id: string;
  kind: SiteKind;
  code: string | null;
  name: string;
  parent: string | null;
}

export class LocationMasterService {
  constructor(private readonly prisma: PrismaClient) {}

  async listSites(ctx: RequestContext): Promise<SiteView[]> {
    const [branches, factories, warehouses, units] = await Promise.all([
      this.prisma.branch.findMany({ where: { tenantId: ctx.tenantId }, take: 200 }),
      this.prisma.factory.findMany({ where: { tenantId: ctx.tenantId }, take: 200 }),
      this.prisma.warehouse.findMany({ where: { tenantId: ctx.tenantId }, take: 200 }),
      this.prisma.businessUnit.findMany({
        where: { tenantId: ctx.tenantId },
        select: { id: true, name: true },
        take: 200,
      }),
    ]);
    const unitName = new Map(units.map((u) => [u.id, u.name]));
    const sites: SiteView[] = [
      ...branches.map((b): SiteView => ({
        id: b.id,
        kind: 'BRANCH',
        code: null,
        name: b.name,
        parent: unitName.get(b.businessUnitId) ?? null,
      })),
      ...factories.map((f): SiteView => ({
        id: f.id,
        kind: 'FACTORY',
        code: null,
        name: f.name,
        parent: unitName.get(f.businessUnitId) ?? null,
      })),
      ...warehouses.map((w): SiteView => ({
        id: w.id,
        kind: 'WAREHOUSE',
        code: w.code,
        name: w.name,
        parent: null,
      })),
    ];
    return sites.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  }

  /** Validate a site reference before other domains bind to it. */
  async resolveSite(kind: SiteKind, id: string, ctx: RequestContext): Promise<SiteView> {
    const sites = await this.listSites(ctx);
    const site = sites.find((s) => s.kind === kind && s.id === id);
    if (!site) throw notFound(`Site(${kind})`, id);
    return site;
  }

  /** Duplicate names across kinds — steward hygiene signal. */
  async duplicateNames(ctx: RequestContext): Promise<Array<{ name: string; count: number }>> {
    const sites = await this.listSites(ctx);
    const counts = new Map<string, number>();
    for (const site of sites) {
      const key = site.name.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name, count]) => ({ name, count }));
  }
}

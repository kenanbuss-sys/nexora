import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PrismaClient } from '@nexora/db';
import type { RequestContext } from '@nexora/tenancy';
import { IS_PUBLIC } from './auth.guard';
import { PRISMA } from './auth.guard';

/**
 * Module activation enforcement (CORE-006, feature flags & licensing):
 * a tenant that has switched a module off loses its API surface as well
 * as its navigation — hidden UI is not authorization. Modules with no
 * explicit activation row are enabled (opt-out semantics).
 */

/** URL prefix (after /api/v1/) → module key. First match wins. */
export const MODULE_ROUTE_MAP: Array<[string, string]> = [
  ['crm', 'crm'],
  ['quotes', 'sales'],
  ['price-lists', 'sales'],
  ['discount-rules', 'sales'],
  ['orders', 'sales'],
  ['returns', 'sales'],
  ['requisitions', 'procurement'],
  ['purchase-orders', 'procurement'],
  ['suppliers', 'procurement'],
  ['boms', 'engineering'],
  ['routings', 'engineering'],
  ['engineering-changes', 'engineering'],
  ['planning', 'planning'],
  ['work-orders', 'manufacturing'],
  ['shopfloor', 'manufacturing'],
  ['qc', 'quality'],
  ['finance', 'finance'],
  ['stock', 'warehouse'],
  ['warehouses', 'warehouse'],
  ['wms', 'warehouse'],
  ['devices', 'devices'],
  ['scan-events', 'devices'],
  ['integrations', 'integrations'],
  ['portal', 'portal'],
  ['portal-users', 'portal'],
];

export function moduleForPath(path: string): string | null {
  const clean = (path.split('?')[0] ?? '').replace(/^\/api\/v1\//, '');
  for (const [prefix, moduleKey] of MODULE_ROUTE_MAP) {
    if (clean === prefix || clean.startsWith(`${prefix}/`)) return moduleKey;
  }
  return null;
}

interface ModuleRequest {
  url: string;
  requestContext?: RequestContext;
}

@Injectable()
export class ModulesGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<ModuleRequest>();
    const ctx = request.requestContext;
    if (!ctx) return false; // AuthGuard must have run
    if (ctx.platformAdmin === true) return true;

    const moduleKey = moduleForPath(request.url);
    if (!moduleKey) return true;

    const activation = await this.prisma.moduleActivation.findUnique({
      where: { tenantId_moduleKey: { tenantId: ctx.tenantId, moduleKey } },
    });
    if (activation && !activation.enabled) {
      throw new ForbiddenException({
        code: 'MODULE_DISABLED',
        message: `The '${moduleKey}' module is disabled for this workspace`,
      });
    }
    return true;
  }
}

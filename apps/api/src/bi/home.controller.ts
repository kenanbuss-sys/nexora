import { Controller, Get, Inject } from '@nestjs/common';
import type { RoleHomeService } from '@nexora/domain-bi';
import type { RoleService } from '@nexora/domain-iam';
import type { RequestContext } from '@nexora/tenancy';
import { Ctx } from '../auth/ctx.decorator';
import { ROLE_SERVICE } from '../auth/permissions.guard';

export const ROLE_HOME_SERVICE = 'ROLE_HOME_SERVICE';

/**
 * Sprint 249: role home — "my work today". No single permission: every
 * section is included only for the tenant-scoped permissions the caller
 * holds (hidden UI is not authorization; the server filters).
 */
@Controller('api/v1/home')
export class HomeController {
  constructor(
    @Inject(ROLE_HOME_SERVICE) private readonly home: RoleHomeService,
    @Inject(ROLE_SERVICE) private readonly roles: RoleService,
  ) {}

  @Get('today')
  async today(@Ctx() ctx: RequestContext) {
    const grants = ctx.userId
      ? await this.roles.getEffectivePermissions(ctx.userId, ctx.tenantId)
      : [];
    const keys = new Set(
      grants.filter((g) => g.scopeType === 'TENANT').map((g) => g.permissionKey),
    );
    return this.home.home(ctx, keys);
  }
}

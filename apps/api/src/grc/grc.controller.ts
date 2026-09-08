import { Controller, Get, Inject, Post } from '@nestjs/common';
import type { GrcService } from '@nexora/domain-core';
import type { RequestContext } from '@nexora/tenancy';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';

export const GRC_SERVICE = 'GRC_SERVICE';

/** GRC registers as governed custom objects (GRC-001..009). */
@Controller('api/v1/grc')
export class GrcController {
  constructor(@Inject(GRC_SERVICE) private readonly grc: GrcService) {}

  @Post('setup')
  @RequirePermission('configuration.publish')
  async setup(@Ctx() ctx: RequestContext) {
    return this.grc.setup(ctx);
  }

  @Get('overview')
  @RequirePermission('configuration.read')
  async overview(@Ctx() ctx: RequestContext) {
    return this.grc.overview(ctx);
  }

  /** GRC-010 — data governance gap report. */
  @Get('data-governance')
  @RequirePermission('configuration.read')
  async dataGovernance(@Ctx() ctx: RequestContext) {
    return this.grc.dataGovernance(ctx);
  }
}

import { Controller, Get, Inject } from '@nestjs/common';
import type { AnalyticsService } from '@nexora/domain-bi';
import type { RequestContext } from '@nexora/tenancy';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';

export const ANALYTICS_SERVICE = 'ANALYTICS_SERVICE';

@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(@Inject(ANALYTICS_SERVICE) private readonly analytics: AnalyticsService) {}

  @Get('kpis')
  @RequirePermission('analytics.read')
  kpis() {
    return { kpis: this.analytics.kpiCatalog() };
  }

  @Get('executive')
  @RequirePermission('analytics.read')
  async executive(@Ctx() ctx: RequestContext) {
    return this.analytics.executiveSummary(ctx);
  }

  @Get('inventory')
  @RequirePermission('analytics.read')
  async inventory(@Ctx() ctx: RequestContext) {
    return { rows: await this.analytics.inventoryAnalytics(ctx) };
  }

  @Get('manufacturing')
  @RequirePermission('analytics.read')
  async manufacturing(@Ctx() ctx: RequestContext) {
    return this.analytics.manufacturingAnalytics(ctx);
  }

  @Get('customers')
  @RequirePermission('analytics.read')
  async customers(@Ctx() ctx: RequestContext) {
    return { rows: await this.analytics.customerAnalytics(ctx) };
  }
}

import { Controller, Get, Inject, Param } from '@nestjs/common';
import type { InsightsService } from '@nexora/domain-ai';
import type { RequestContext } from '@nexora/tenancy';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';

export const INSIGHTS_SERVICE = 'INSIGHTS_SERVICE';

/** Deterministic, explainable AI insights (AI-004/005/008/010/014). */
@Controller('api/v1/insights')
export class InsightsController {
  constructor(@Inject(INSIGHTS_SERVICE) private readonly insights: InsightsService) {}

  @Get('demand/:skuId')
  @RequirePermission('analytics.read')
  async demand(@Param('skuId') skuId: string, @Ctx() ctx: RequestContext) {
    return this.insights.demandForecast(skuId, ctx);
  }

  @Get('stockout-risk')
  @RequirePermission('analytics.read')
  async stockoutRisk(@Ctx() ctx: RequestContext) {
    return this.insights.stockoutRisk(ctx);
  }

  @Get('bottlenecks')
  @RequirePermission('analytics.read')
  async bottlenecks(@Ctx() ctx: RequestContext) {
    return this.insights.bottlenecks(ctx);
  }

  @Get('anomalies')
  @RequirePermission('analytics.read')
  async anomalies(@Ctx() ctx: RequestContext) {
    return this.insights.anomalies(ctx);
  }
}

import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { CopilotService, InsightsService } from '@nexora/domain-ai';
import type { RequestContext } from '@nexora/tenancy';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';

export const INSIGHTS_SERVICE = 'INSIGHTS_SERVICE';
export const COPILOT_SERVICE = 'COPILOT_SERVICE';

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

  @Get('cash-projection')
  @RequirePermission('finance.read')
  async cashProjection(@Ctx() ctx: RequestContext) {
    return this.insights.cashProjection(ctx);
  }

  @Get('production-delays')
  @RequirePermission('production.read')
  async productionDelays(@Ctx() ctx: RequestContext) {
    return this.insights.productionDelays(ctx);
  }

  @Get('process-paths')
  @RequirePermission('analytics.read')
  async processPaths(@Ctx() ctx: RequestContext) {
    return this.insights.processPaths(ctx);
  }

  @Get('replenishment')
  @RequirePermission('analytics.read')
  async replenishment(@Ctx() ctx: RequestContext) {
    return this.insights.replenishmentRecommendations(ctx);
  }
}

import { z } from 'zod';
import { parseBody } from '../common/validate';

/** Copilots & controlled agents (AI-001/002/012/013). */
@Controller('api/v1/copilot')
export class CopilotController {
  constructor(@Inject(COPILOT_SERVICE) private readonly copilot: CopilotService) {}

  @Post('ask')
  @RequirePermission('analytics.read')
  async ask(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({ role: z.string().min(2).max(30), question: z.string().min(3).max(500) }),
      body,
    );
    return this.copilot.ask(input, ctx);
  }

  @Post('agent/actions')
  @RequirePermission('automation.manage')
  async agentAction(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({ action: z.string().min(3).max(60), title: z.string().min(3).max(200) }),
      body,
    );
    // The safe list is tenant configuration, resolved in the module factory.
    return this.copilot.runAgentAction({ ...input, safeActions: ['create_task'] }, ctx);
  }
}

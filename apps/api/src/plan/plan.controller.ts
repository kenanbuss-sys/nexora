import { Body, Controller, Get, Inject, Param, Post, Put } from '@nestjs/common';
import type { AdvancedPlanningService, PlanningService } from '@nexora/domain-plan';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const PLANNING_SERVICE = 'PLANNING_SERVICE';
export const ADVANCED_PLANNING_SERVICE = 'ADVANCED_PLANNING_SERVICE';

const policySchema = z.object({
  skuId: z.string().uuid(),
  safetyStock: z.number().min(0).optional(),
  reorderPoint: z.number().min(0).optional(),
  leadTimeDays: z.number().int().min(0).max(365).optional(),
});

@Controller('api/v1/planning')
export class PlanningController {
  constructor(@Inject(PLANNING_SERVICE) private readonly planning: PlanningService) {}

  @Get('policies')
  @RequirePermission('plan.read')
  async policies(@Ctx() ctx: RequestContext) {
    return { policies: await this.planning.listPolicies(ctx) };
  }

  @Put('policies')
  @RequirePermission('plan.manage')
  async setPolicy(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.planning.setPolicy(parseBody(policySchema, body), ctx);
  }

  @Get('runs')
  @RequirePermission('plan.read')
  async runs(@Ctx() ctx: RequestContext) {
    return { runs: await this.planning.listRuns(ctx) };
  }

  @Get('replenishment')
  @RequirePermission('plan.read')
  async replenishment(@Ctx() ctx: RequestContext) {
    return { rows: await this.planning.replenishmentReport(ctx) };
  }

  @Post('runs')
  @RequirePermission('plan.manage')
  async run(@Ctx() ctx: RequestContext) {
    return this.planning.runMrp(ctx);
  }

  @Get('runs/:id')
  @RequirePermission('plan.read')
  async getRun(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.planning.getRun(id, ctx);
  }
}

const forecastSchema = z.object({
  version: z.string().min(1).max(64),
  entries: z
    .array(
      z.object({
        skuCode: z.string().min(1).max(60),
        period: z.string().regex(/^\d{4}-\d{2}$/),
        qty: z.number().nonnegative(),
      }),
    )
    .min(1)
    .max(500),
});
const sopSchema = z.object({
  version: z.string().min(1).max(64),
  period: z.string().regex(/^\d{4}-\d{2}$/),
});
const whatIfSchema = z.object({
  extraMinutesPerDay: z.number().nonnegative().optional(),
  demandFactor: z.number().nonnegative().optional(),
});

/**
 * Advanced planning (PLAN-001/002/003/010..014): forecasts, S&OP,
 * capacity, finite scheduling, constraints and what-if simulation.
 */
@Controller('api/v1/planning/advanced')
export class AdvancedPlanningController {
  constructor(
    @Inject(ADVANCED_PLANNING_SERVICE) private readonly advanced: AdvancedPlanningService,
  ) {}

  @Post('forecasts')
  @RequirePermission('plan.manage')
  async publishForecast(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.advanced.publishForecast(parseBody(forecastSchema, body), ctx);
  }

  @Get('forecasts')
  @RequirePermission('plan.read')
  async forecastVersions(@Ctx() ctx: RequestContext) {
    return { versions: await this.advanced.forecastVersions(ctx) };
  }

  @Get('forecasts/:version')
  @RequirePermission('plan.read')
  async forecast(@Param('version') version: string, @Ctx() ctx: RequestContext) {
    return { entries: await this.advanced.forecast(version, ctx) };
  }

  @Post('sop')
  @RequirePermission('plan.read')
  async sop(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return { rows: await this.advanced.sop(parseBody(sopSchema, body), ctx) };
  }

  @Get('capacity')
  @RequirePermission('plan.read')
  async capacity(@Ctx() ctx: RequestContext) {
    return { capacity: await this.advanced.capacity(ctx) };
  }

  @Post('capacity/what-if')
  @RequirePermission('plan.read')
  async whatIf(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return { capacity: await this.advanced.capacity(ctx, parseBody(whatIfSchema, body)) };
  }

  @Get('constraints')
  @RequirePermission('plan.read')
  async constraints(@Ctx() ctx: RequestContext) {
    return this.advanced.constraints(ctx);
  }

  @Get('schedule')
  @RequirePermission('plan.read')
  async schedule(@Ctx() ctx: RequestContext) {
    return { schedule: await this.advanced.schedule(ctx) };
  }
}

import { Body, Controller, Get, Inject, Param, Post, Put } from '@nestjs/common';
import type { PlanningService } from '@nexora/domain-plan';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const PLANNING_SERVICE = 'PLANNING_SERVICE';

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

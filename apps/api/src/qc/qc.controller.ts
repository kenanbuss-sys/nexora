import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { QualityService } from '@nexora/domain-qc';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const QUALITY_SERVICE = 'QUALITY_SERVICE';

const createPlanSchema = z.object({
  skuId: z.string().uuid(),
  name: z.string().min(1).max(200),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        requirement: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(50),
});
const createInspectionSchema = z.object({ workOrderId: z.string().uuid() });
const recordItemSchema = z.object({
  itemId: z.string().uuid(),
  passed: z.boolean(),
  note: z.string().max(500).optional(),
});
const createNcrSchema = z.object({
  skuId: z.string().uuid(),
  description: z.string().min(1).max(1000),
  severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']).optional(),
  workOrderId: z.string().uuid().optional(),
});
const resolveNcrSchema = z.object({ resolution: z.string().min(1).max(1000) });

@Controller('api/v1/qc/plans')
export class QcPlansController {
  constructor(@Inject(QUALITY_SERVICE) private readonly quality: QualityService) {}

  @Get()
  @RequirePermission('qc.read')
  async list(@Ctx() ctx: RequestContext) {
    return { plans: await this.quality.listPlans(ctx) };
  }

  @Post()
  @RequirePermission('qc.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.quality.createPlan(parseBody(createPlanSchema, body), ctx);
  }
}

@Controller('api/v1/qc/inspections')
export class QcInspectionsController {
  constructor(@Inject(QUALITY_SERVICE) private readonly quality: QualityService) {}

  @Get()
  @RequirePermission('qc.read')
  async list(@Ctx() ctx: RequestContext, @Query('workOrderId') workOrderId?: string) {
    return {
      inspections: await this.quality.listInspections(
        { workOrderId: workOrderId || undefined },
        ctx,
      ),
    };
  }

  @Post()
  @RequirePermission('qc.record')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.quality.createInspection(parseBody(createInspectionSchema, body), ctx);
  }

  @Get(':id')
  @RequirePermission('qc.read')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.quality.getInspection(id, ctx);
  }

  @Post(':id/items')
  @RequirePermission('qc.record')
  async recordItem(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(recordItemSchema, body);
    return this.quality.recordItem({ inspectionId: id, ...input }, ctx);
  }

  @Post(':id/finalize')
  @RequirePermission('qc.approve')
  async finalize(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.quality.finalizeInspection(id, ctx);
  }
}

@Controller('api/v1/qc/ncrs')
export class NcrsController {
  constructor(@Inject(QUALITY_SERVICE) private readonly quality: QualityService) {}

  @Get()
  @RequirePermission('qc.read')
  async list(@Ctx() ctx: RequestContext) {
    return { ncrs: await this.quality.listNcrs(ctx) };
  }

  @Post()
  @RequirePermission('qc.record')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.quality.createNcr(parseBody(createNcrSchema, body), ctx);
  }

  @Post(':id/resolve')
  @RequirePermission('qc.approve')
  async resolve(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(resolveNcrSchema, body);
    return this.quality.resolveNcr({ ncrId: id, ...input }, ctx);
  }
}

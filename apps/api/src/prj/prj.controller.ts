import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { ProjectService } from '@nexora/domain-prj';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const PROJECT_SERVICE = 'PROJECT_SERVICE';

const costSchema = z.object({
  entryId: z.string().min(1).max(64),
  kind: z.enum(['labor', 'material', 'subcontract', 'other']),
  amount: z.number().positive(),
  description: z.string().min(1).max(400),
});
const timesheetSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().positive().max(24),
});
const poLinkSchema = z.object({ purchaseOrderId: z.string().min(1) });
const issueSchema = z.object({
  warehouseId: z.string().min(1),
  skuId: z.string().min(1),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  key: z.string().min(1).max(64),
});
const changeOrderSchema = z.object({
  key: z.string().min(1).max(64),
  delta: z.number(),
  reason: z.string().min(5).max(400),
});
const revenueSchema = z.object({ amount: z.number().nonnegative() });
const milestoneDoneSchema = z.object({ milestoneRecordId: z.string().min(1) });

/**
 * PRJ — project & job management (PRJ-001..012). Project, site and
 * milestone records are created through the governed custom-object
 * routes; these endpoints add costing, timesheets, procurement and
 * inventory linkage, change orders and profitability.
 */
@Controller('api/v1/projects')
export class ProjectsController {
  constructor(@Inject(PROJECT_SERVICE) private readonly service: ProjectService) {}

  @Post('setup')
  @RequirePermission('configuration.publish')
  async setup(@Ctx() ctx: RequestContext) {
    return this.service.setup(ctx);
  }

  @Get()
  @RequirePermission('project.read')
  async list(@Ctx() ctx: RequestContext) {
    return { projects: await this.service.projects(ctx) };
  }

  @Post(':code/costs')
  @RequirePermission('project.manage')
  async addCost(@Param('code') code: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.service.addCost({ projectCode: code, ...parseBody(costSchema, body) }, ctx);
  }

  @Post(':code/timesheets')
  @RequirePermission('project.manage')
  async timesheet(@Param('code') code: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.service.recordTimesheet(
      { projectCode: code, ...parseBody(timesheetSchema, body) },
      ctx,
    );
  }

  @Post(':code/purchase-orders')
  @RequirePermission('project.manage')
  async linkPo(@Param('code') code: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.service.linkPurchaseOrder(
      { projectCode: code, ...parseBody(poLinkSchema, body) },
      ctx,
    );
  }

  @Post(':code/material-issues')
  @RequirePermission('project.manage')
  async issue(@Param('code') code: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.service.issueMaterial({ projectCode: code, ...parseBody(issueSchema, body) }, ctx);
  }

  @Post(':code/change-orders')
  @RequirePermission('project.manage')
  async changeOrder(
    @Param('code') code: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    return this.service.changeOrder(
      { projectCode: code, ...parseBody(changeOrderSchema, body) },
      ctx,
    );
  }

  @Post(':code/revenue')
  @RequirePermission('project.manage')
  async revenue(@Param('code') code: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.service.setRevenue({ projectCode: code, ...parseBody(revenueSchema, body) }, ctx);
  }

  @Post(':code/milestones/complete')
  @RequirePermission('project.manage')
  async completeMilestone(
    @Param('code') code: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    return this.service.completeMilestone(
      { projectCode: code, ...parseBody(milestoneDoneSchema, body) },
      ctx,
    );
  }

  @Get(':code/milestones')
  @RequirePermission('project.read')
  async milestones(@Param('code') code: string, @Ctx() ctx: RequestContext) {
    return { milestones: await this.service.milestones(code, ctx) };
  }

  @Get(':code/costing')
  @RequirePermission('project.read')
  async costing(@Param('code') code: string, @Ctx() ctx: RequestContext) {
    return this.service.costing(code, ctx);
  }

  @Get(':code/profitability')
  @RequirePermission('project.read')
  async profitability(@Param('code') code: string, @Ctx() ctx: RequestContext) {
    return this.service.profitability(code, ctx);
  }

  @Get(':code/documents')
  @RequirePermission('project.read')
  async documents(@Param('code') code: string, @Ctx() ctx: RequestContext) {
    return { documents: await this.service.documents(code, ctx) };
  }
}

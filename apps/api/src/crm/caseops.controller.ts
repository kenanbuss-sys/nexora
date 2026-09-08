import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { CaseOpsService } from '@nexora/domain-crm';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const CASE_OPS_SERVICE = 'CASE_OPS_SERVICE';

const intakeSchema = z.object({
  subject: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  channel: z.string().min(1).max(40),
  accountId: z.string().optional(),
  orderId: z.string().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
});
const reasonSchema = z.object({ reason: z.string().min(5).max(400) });
const commentSchema = z.object({ body: z.string().min(1).max(2000) });
const cannedRenderSchema = z.object({ key: z.string().min(1).max(60) });
const linkSchema = z.object({
  entityType: z.enum(['order', 'service_request', 'rma']),
  entityId: z.string().min(1),
});
const rateSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

/**
 * Support-case operations (CSM-002..015): omnichannel intake,
 * complaints, escalations, collaboration, canned responses, the
 * knowledge base, record linkage and satisfaction feedback.
 */
@Controller('api/v1/support-cases')
export class CaseOpsController {
  constructor(@Inject(CASE_OPS_SERVICE) private readonly ops: CaseOpsService) {}

  @Post('intake')
  @RequirePermission('crm.manage')
  async intake(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.ops.intake(parseBody(intakeSchema, body), ctx);
  }

  @Get('reports/channels')
  @RequirePermission('crm.read')
  async channels(@Ctx() ctx: RequestContext) {
    return { channels: await this.ops.channelReport(ctx) };
  }

  @Post(':id/complaint')
  @RequirePermission('crm.manage')
  async complaint(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.ops.markComplaint({ caseId: id, ...parseBody(reasonSchema, body) }, ctx);
  }

  @Get('reports/complaints')
  @RequirePermission('crm.read')
  async complaints(@Ctx() ctx: RequestContext) {
    return this.ops.complaintReport(ctx);
  }

  @Post(':id/escalate')
  @RequirePermission('crm.manage')
  async escalate(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.ops.escalate({ caseId: id, ...parseBody(reasonSchema, body) }, ctx);
  }

  @Post(':id/comments')
  @RequirePermission('crm.manage')
  async comment(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.ops.comment({ caseId: id, ...parseBody(commentSchema, body) }, ctx);
  }

  @Get(':id/comments')
  @RequirePermission('crm.read')
  async comments(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { comments: await this.ops.comments(id, ctx) };
  }

  @Get('canned-responses')
  @RequirePermission('crm.read')
  async canned(@Ctx() ctx: RequestContext) {
    return { responses: await this.ops.cannedResponses(ctx) };
  }

  @Post(':id/canned-responses/render')
  @RequirePermission('crm.read')
  async renderCanned(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.ops.renderCanned({ caseId: id, ...parseBody(cannedRenderSchema, body) }, ctx);
  }

  @Post('kb/setup')
  @RequirePermission('configuration.publish')
  async setupKb(@Ctx() ctx: RequestContext) {
    return this.ops.setupKb(ctx);
  }

  @Get('kb/search')
  @RequirePermission('crm.read')
  async searchKb(@Query('q') q: string, @Ctx() ctx: RequestContext) {
    return { articles: await this.ops.searchKb(q ?? '', ctx) };
  }

  @Post(':id/links')
  @RequirePermission('crm.manage')
  async link(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.ops.link({ caseId: id, ...parseBody(linkSchema, body) }, ctx);
  }

  @Get(':id/links')
  @RequirePermission('crm.read')
  async links(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { links: await this.ops.links(id, ctx) };
  }

  @Post(':id/rate')
  @RequirePermission('crm.manage')
  async rate(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.ops.rate({ caseId: id, ...parseBody(rateSchema, body) }, ctx);
  }

  @Get('reports/satisfaction')
  @RequirePermission('crm.read')
  async satisfaction(@Ctx() ctx: RequestContext) {
    return this.ops.satisfactionReport(ctx);
  }
}

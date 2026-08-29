import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { ApprovalService, RuleService, WorkflowService } from '@nexora/domain-wf';
import type { RoleService } from '@nexora/domain-iam';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission, ROLE_SERVICE } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';
import { APPROVAL_SERVICE } from '../tasks/tasks.controller';

export const WORKFLOW_SERVICE = 'WORKFLOW_SERVICE';
export const WF_RULE_SERVICE = 'WF_RULE_SERVICE';

const publishWorkflowSchema = z.object({
  key: z.string().min(2).max(64),
  name: z.string().min(1).max(200),
  spec: z.record(z.string(), z.unknown()),
});
const startWorkflowSchema = z.object({
  definitionKey: z.string().min(2).max(64),
  subjectObjectType: z.string().max(64).optional(),
  subjectObjectId: z.string().max(100).optional(),
});
const transitionSchema = z.object({ trigger: z.string().min(1).max(64) });
const publishRuleSchema = z.object({
  key: z.string().min(2).max(64),
  name: z.string().min(1).max(200),
  spec: z.record(z.string(), z.unknown()),
  enabled: z.boolean().optional(),
});
const decideSchema = z.object({ reason: z.string().max(500).optional() });
const requestApprovalSchema = z.object({
  title: z.string().min(1).max(300),
  subjectObjectType: z.string().min(1).max(64),
  subjectObjectId: z.string().min(1).max(100),
});

@Controller('api/v1/workflows')
export class WorkflowsController {
  constructor(
    @Inject(WORKFLOW_SERVICE) private readonly workflows: WorkflowService,
    @Inject(ROLE_SERVICE) private readonly roles: RoleService,
  ) {}

  @Post('publish')
  @RequirePermission('workflow.publish')
  async publish(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.workflows.publishWorkflow(parseBody(publishWorkflowSchema, body), ctx);
  }

  @Post('instances')
  @RequirePermission('workflow.read')
  async start(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.workflows.startWorkflow(parseBody(startWorkflowSchema, body), ctx);
  }

  @Post('instances/:id/transition')
  @RequirePermission('workflow.read')
  async transition(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(transitionSchema, body);
    return this.workflows.transition(id, input.trigger, ctx, (permissionKey) =>
      this.roles.authorize(ctx, permissionKey),
    );
  }

  @Get('instances/:id')
  @RequirePermission('workflow.read')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.workflows.getInstance(id, ctx);
  }
}

@Controller('api/v1/rules')
export class RulesController {
  constructor(@Inject(WF_RULE_SERVICE) private readonly rules: RuleService) {}

  @Post('publish')
  @RequirePermission('automation.manage')
  async publish(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.rules.publishRule(parseBody(publishRuleSchema, body), ctx);
  }

  @Get()
  @RequirePermission('automation.manage')
  async list(@Ctx() ctx: RequestContext) {
    return { rules: await this.rules.listRules(ctx) };
  }
}

@Controller('api/v1/approvals')
export class ApprovalsController {
  constructor(@Inject(APPROVAL_SERVICE) private readonly approvals: ApprovalService) {}

  @Post('request')
  @RequirePermission('approval.act')
  async request(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.approvals.requestApproval(parseBody(requestApprovalSchema, body), ctx);
  }

  @Post(':id/approve')
  @RequirePermission('approval.act')
  async approve(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(decideSchema, body);
    return this.approvals.decide(id, 'GRANTED', input.reason, ctx);
  }

  @Post(':id/reject')
  @RequirePermission('approval.act')
  async reject(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(decideSchema, body);
    return this.approvals.decide(id, 'REJECTED', input.reason, ctx);
  }

  @Get('pending')
  @RequirePermission('approval.act')
  async pending(@Ctx() ctx: RequestContext) {
    return { approvals: await this.approvals.pendingForUser(ctx) };
  }
}

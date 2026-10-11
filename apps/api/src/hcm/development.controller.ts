import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { TRAINING_ITEM_STATUSES, type DevelopmentService } from '@nexora/domain-hcm';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const DEVELOPMENT_SERVICE = 'DEVELOPMENT_SERVICE';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const KEY = z.string().regex(/^[A-Za-z0-9_.:-]{8,80}$/);
const statusEnum = z.enum(Object.keys(TRAINING_ITEM_STATUSES) as [string, ...string[]]);
const assignSchema = z.object({
  mentorUserId: z.string().uuid().nullable(),
  qualificationLevel: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{1,29}$/)
    .nullable(),
});
const templateSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
  name: z.string().min(1).max(120),
  qualificationLevel: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{1,29}$/)
    .optional(),
  items: z
    .array(z.object({ key: z.string().min(1).max(40), text: z.string().min(1).max(300) }))
    .min(1)
    .max(100),
});
const startSchema = z.object({
  employeeId: z.string().uuid(),
  templateKey: z.string().max(64).optional(),
  dueDate: DATE,
  recheckDate: DATE.optional(),
  requestKey: KEY,
});
const itemSchema = z.object({
  status: statusEnum,
  note: z.string().max(500).optional(),
  expectedVersion: z.number().int().min(1),
});
const recordSchema = z.object({
  employeeId: z.string().uuid(),
  sessionDate: DATE,
  topic: z.string().min(1).max(200),
  notes: z.string().min(1).max(4000),
  outcome: z.string().max(500).optional(),
  recheckDate: DATE.optional(),
  requestKey: KEY,
});

/**
 * HCM-017 (Sprint 237) — employee development (qualification levels,
 * training plans, training/mentoring records). Guard: hcm.read; mentor
 * scope (hcm.development.own = own employees only, hcm.development.manage
 * = all, templates and assignment) is enforced in the HCM domain service.
 */
@Controller('api/v1/hcm/development')
export class DevelopmentController {
  constructor(@Inject(DEVELOPMENT_SERVICE) private readonly development: DevelopmentService) {}

  @Get('settings')
  @RequirePermission('hcm.read')
  async settings(@Ctx() ctx: RequestContext) {
    return this.development.settings(ctx);
  }

  @Get('employees')
  @RequirePermission('hcm.read')
  async employees(@Query('asOf') asOf: string | undefined, @Ctx() ctx: RequestContext) {
    return { employees: await this.development.staff(ctx, asOf) };
  }

  @Get('overview')
  @RequirePermission('hcm.read')
  async overview(@Query('asOf') asOf: string | undefined, @Ctx() ctx: RequestContext) {
    return this.development.overview(ctx, asOf);
  }

  @Post('employees/:id/assignment')
  @RequirePermission('hcm.development.manage')
  async assign(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(assignSchema, body);
    return this.development.assign({ employeeId: parseBody(z.string().uuid(), id), ...input }, ctx);
  }

  @Get('templates')
  @RequirePermission('hcm.read')
  async templates(@Ctx() ctx: RequestContext) {
    return { templates: await this.development.templates(ctx) };
  }

  @Post('templates')
  @RequirePermission('hcm.development.manage')
  async publish(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.development.publishTemplate(parseBody(templateSchema, body), ctx);
  }

  @Get('plans')
  @RequirePermission('hcm.read')
  async plans(
    @Query('employeeId') employeeId: string | undefined,
    @Query('status') status: string | undefined,
    @Ctx() ctx: RequestContext,
  ) {
    const q = parseBody(
      z.object({
        employeeId: z.string().uuid().optional(),
        status: z.enum(['OPEN', 'CLOSED']).optional(),
      }),
      { ...(employeeId ? { employeeId } : {}), ...(status ? { status } : {}) },
    );
    return { plans: await this.development.plans(q, ctx) };
  }

  @Post('plans')
  @RequirePermission('hcm.read')
  async start(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.development.startPlan(parseBody(startSchema, body), ctx);
  }

  @Get('plans/:id')
  @RequirePermission('hcm.read')
  async plan(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.development.plan(parseBody(z.string().uuid(), id), ctx);
  }

  @Post('plans/:id/items/:itemKey')
  @RequirePermission('hcm.read')
  async item(
    @Param('id') id: string,
    @Param('itemKey') itemKey: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(itemSchema, body);
    return this.development.setItem(
      {
        planId: parseBody(z.string().uuid(), id),
        itemKey: parseBody(z.string().min(1).max(40), itemKey),
        status: input.status as keyof typeof TRAINING_ITEM_STATUSES,
        note: input.note,
        expectedVersion: input.expectedVersion,
      },
      ctx,
    );
  }

  @Post('plans/:id/close')
  @RequirePermission('hcm.read')
  async close(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.development.closePlan(parseBody(z.string().uuid(), id), ctx);
  }

  @Get('records')
  @RequirePermission('hcm.read')
  async records(@Query('employeeId') employeeId: string, @Ctx() ctx: RequestContext) {
    return {
      records: await this.development.records(parseBody(z.string().uuid(), employeeId), ctx),
    };
  }

  @Post('records')
  @RequirePermission('hcm.read')
  async log(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.development.logTraining(parseBody(recordSchema, body), ctx);
  }
}

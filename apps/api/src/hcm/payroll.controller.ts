import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import type { PayrollService } from '@nexora/domain-hcm';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const PAYROLL_SERVICE = 'PAYROLL_SERVICE';

const periodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
const salarySchema = z.object({
  employeeId: z.string().uuid(),
  netAmount: z.number().positive().max(1e9),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(200).optional(),
});
const lockSchema = z.object({ employeeId: z.string().uuid(), locked: z.boolean() });
const adjustmentSchema = periodSchema.extend({
  employeeId: z.string().uuid(),
  kind: z.enum(['BONUS', 'DEDUCTION']),
  amount: z.number().positive().max(1e9),
  reason: z.string().min(3).max(200),
  requestKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,80}$/),
});

/**
 * HCM-013/014 (Sprint 235) — salaries and payroll. The route guard only
 * requires hcm.read; the salary policy (hcm.salary.read / .contract /
 * .manage / .management) is enforced in the HCM domain service, so
 * restricted amounts never leave the API.
 */
@Controller('api/v1/payroll')
export class PayrollController {
  constructor(@Inject(PAYROLL_SERVICE) private readonly payroll: PayrollService) {}

  @Get('salaries')
  @RequirePermission('hcm.read')
  async salaries(@Ctx() ctx: RequestContext) {
    return this.payroll.salaries(ctx);
  }

  @Post('salaries')
  @RequirePermission('hcm.read')
  async setSalary(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.payroll.setSalary(parseBody(salarySchema, body), ctx);
  }

  @Post('salary-lock')
  @RequirePermission('hcm.read')
  async lock(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.payroll.setSalaryLock(parseBody(lockSchema, body), ctx);
  }

  @Post('adjustments')
  @RequirePermission('hcm.read')
  async adjustment(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.payroll.addAdjustment(parseBody(adjustmentSchema, body), ctx);
  }

  @Get('runs')
  @RequirePermission('hcm.read')
  async view(
    @Query('year') year: string,
    @Query('month') month: string,
    @Ctx() ctx: RequestContext,
  ) {
    return this.payroll.view(parseBody(periodSchema, { year, month }), ctx);
  }

  @Post('runs/compute')
  @RequirePermission('hcm.read')
  async compute(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.payroll.compute(parseBody(periodSchema, body), ctx);
  }

  @Post('runs/confirm')
  @RequirePermission('hcm.read')
  async confirm(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.payroll.confirm(parseBody(periodSchema, body), ctx);
  }

  @Get('payslip')
  @RequirePermission('hcm.read')
  async payslip(
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('employeeId') employeeId: string,
    @Ctx() ctx: RequestContext,
  ) {
    const q = parseBody(periodSchema.extend({ employeeId: z.string().uuid() }), {
      year,
      month,
      employeeId,
    });
    return this.payroll.payslip(q, ctx);
  }
}

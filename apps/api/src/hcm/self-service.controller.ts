import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { SelfServiceService } from '@nexora/domain-hcm';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const SELF_SERVICE = 'SELF_SERVICE';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const leaveSchema = z.object({
  from: DATE,
  to: DATE,
  type: z.enum(['GODISNJI', 'BOLOVANJE', 'PLACENO', 'NEPLACENO', 'OSTALO']),
  note: z.string().max(300).optional(),
});
const periodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

/**
 * HCM-018 (Sprint 253) — employee self-service. Every route works on the
 * employee linked to the signed-in user; no route accepts an employee id.
 * Permission hcm.self; payslips additionally need the tenant switch
 * hcm.selfService.payslips (enforced in the domain service).
 */
@Controller('api/v1/hcm/me')
export class SelfServiceController {
  constructor(@Inject(SELF_SERVICE) private readonly self: SelfServiceService) {}

  @Get()
  @RequirePermission('hcm.self')
  profile(@Ctx() ctx: RequestContext) {
    return this.self.profile(ctx);
  }

  @Get('attendance')
  @RequirePermission('hcm.self')
  attendance(
    @Query('year') year: string | undefined,
    @Query('month') month: string | undefined,
    @Ctx() ctx: RequestContext,
  ) {
    return this.self.attendance(parseBody(periodSchema, { year, month }), ctx);
  }

  @Get('leave')
  @RequirePermission('hcm.self')
  async leave(@Ctx() ctx: RequestContext) {
    return { leave: await this.self.leaveList(ctx) };
  }

  @Post('leave')
  @RequirePermission('hcm.self')
  requestLeave(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.self.requestLeave(parseBody(leaveSchema, body), ctx);
  }

  @Get('contracts')
  @RequirePermission('hcm.self')
  async contracts(@Ctx() ctx: RequestContext) {
    return { contracts: await this.self.contracts(ctx) };
  }

  @Get('documents')
  @RequirePermission('hcm.self')
  async documents(@Ctx() ctx: RequestContext) {
    return { documents: await this.self.myDocuments(ctx) };
  }

  @Get('documents/:id')
  @RequirePermission('hcm.self')
  download(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.self.downloadDocument(parseBody(z.string().uuid(), id), ctx);
  }

  @Get('payslips')
  @RequirePermission('hcm.self')
  async payslips(@Ctx() ctx: RequestContext) {
    return { payslips: await this.self.payslips(ctx) };
  }

  @Get('payslips/:year/:month')
  @RequirePermission('hcm.self')
  payslip(@Param('year') year: string, @Param('month') month: string, @Ctx() ctx: RequestContext) {
    return this.self.payslip(parseBody(periodSchema, { year, month }), ctx);
  }
}

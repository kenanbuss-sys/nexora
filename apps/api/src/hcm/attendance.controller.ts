import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import type { AttendanceMatrixService } from '@nexora/domain-hcm';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const ATTENDANCE_SERVICE = 'ATTENDANCE_SERVICE';

const periodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
const daySchema = z.object({
  employeeId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  statusKey: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{1,29}$/)
    .nullable(),
  note: z.string().max(300).optional(),
  expectedVersion: z.number().int().min(0).optional(),
});
const unlockSchema = periodSchema.extend({ reason: z.string().min(5).max(400) });

/**
 * HCM-015 (Sprint 234) — attendance status matrix (šihtarica). Reads need
 * hcm.read; edits, applying clock/leave suggestions, month lock/unlock
 * and the change-control report need hcm.manage.
 */
@Controller('api/v1/workforce/attendance')
export class AttendanceController {
  constructor(@Inject(ATTENDANCE_SERVICE) private readonly attendance: AttendanceMatrixService) {}

  @Get('settings')
  @RequirePermission('hcm.read')
  async settings(@Ctx() ctx: RequestContext) {
    return this.attendance.settings(ctx);
  }

  @Get('matrix')
  @RequirePermission('hcm.read')
  async matrix(
    @Query('year') year: string,
    @Query('month') month: string,
    @Ctx() ctx: RequestContext,
  ) {
    return this.attendance.matrix(parseBody(periodSchema, { year, month }), ctx);
  }

  @Get('digest')
  @RequirePermission('hcm.read')
  async digest(
    @Query('year') year: string,
    @Query('month') month: string,
    @Ctx() ctx: RequestContext,
  ) {
    return this.attendance.digest(parseBody(periodSchema, { year, month }), ctx);
  }

  @Get('changes')
  @RequirePermission('hcm.manage')
  async changes(
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('employeeId') employeeId: string | undefined,
    @Ctx() ctx: RequestContext,
  ) {
    const q = parseBody(periodSchema.extend({ employeeId: z.string().uuid().optional() }), {
      year,
      month,
      ...(employeeId ? { employeeId } : {}),
    });
    return { changes: await this.attendance.changes(q, ctx) };
  }

  @Post('day')
  @RequirePermission('hcm.manage')
  async setDay(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.attendance.setDay(parseBody(daySchema, body), ctx);
  }

  @Post('apply-suggestions')
  @RequirePermission('hcm.manage')
  async apply(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.attendance.applySuggestions(parseBody(periodSchema, body), ctx);
  }

  @Post('lock')
  @RequirePermission('hcm.manage')
  async lock(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.attendance.lockMonth(parseBody(periodSchema, body), ctx);
  }

  @Post('unlock')
  @RequirePermission('hcm.manage')
  async unlock(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.attendance.unlockMonth(parseBody(unlockSchema, body), ctx);
  }
}

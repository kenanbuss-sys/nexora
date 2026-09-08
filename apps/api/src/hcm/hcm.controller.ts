import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { EmployeeService, WorkforceService } from '@nexora/domain-hcm';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const EMPLOYEE_SERVICE = 'EMPLOYEE_SERVICE';
export const WORKFORCE_SERVICE = 'WORKFORCE_SERVICE';

const createEmployeeSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  title: z.string().max(120).optional(),
  hiredAt: z.string().datetime().optional(),
});
const skillsSchema = z.object({ skills: z.array(z.string().min(1).max(60)).max(30) });
const employeeStatusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });

@Controller('api/v1/employees')
export class EmployeesController {
  constructor(@Inject(EMPLOYEE_SERVICE) private readonly employees: EmployeeService) {}

  @Get()
  @RequirePermission('hcm.read')
  async list(@Ctx() ctx: RequestContext) {
    return { employees: await this.employees.listEmployees(ctx) };
  }

  @Post()
  @RequirePermission('hcm.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.employees.createEmployee(parseBody(createEmployeeSchema, body), ctx);
  }

  @Post(':id/skills')
  @RequirePermission('hcm.manage')
  async setSkills(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(skillsSchema, body);
    return this.employees.setSkills(id, input.skills, ctx);
  }

  @Post(':id/status')
  @RequirePermission('hcm.manage')
  async setStatus(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(employeeStatusSchema, body);
    return this.employees.setStatus(id, input.status, ctx);
  }
}

const clockSchema = z.object({
  event: z.enum(['IN', 'OUT']),
  eventId: z.string().min(1).max(64),
});
const shiftAssignSchema = z.object({
  employeeId: z.string().min(1),
  shiftKey: z.string().min(1).max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const leaveSchema = z.object({
  employeeId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.string().min(1).max(40),
});
const certificationsSchema = z.object({
  certifications: z
    .array(z.object({ name: z.string().min(1).max(120), until: z.string().min(4).max(10) }))
    .max(50),
});
const payrollExportSchema = z.object({
  connectorKey: z.string().min(1).max(60),
  period: z.string().regex(/^\d{4}-\d{2}$/),
});

/**
 * HCM workforce operations (HCM-002/003/004/006/007/009/012): time &
 * attendance, shift planning, leave with approval, certifications,
 * performance snapshots and payroll export via connectors.
 */
@Controller('api/v1/workforce')
export class WorkforceController {
  constructor(@Inject(WORKFORCE_SERVICE) private readonly workforce: WorkforceService) {}

  @Post('employees/:id/clock')
  @RequirePermission('hcm.manage')
  async clock(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(clockSchema, body);
    return this.workforce.clockEvent({ employeeId: id, ...input }, ctx);
  }

  @Get('employees/:id/attendance')
  @RequirePermission('hcm.read')
  async attendance(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.workforce.attendanceReport(id, ctx);
  }

  @Post('shifts/assign')
  @RequirePermission('hcm.manage')
  async assignShift(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.workforce.assignShift(parseBody(shiftAssignSchema, body), ctx);
  }

  @Get('roster')
  @RequirePermission('hcm.read')
  async roster(@Query('date') date: string, @Ctx() ctx: RequestContext) {
    return { roster: await this.workforce.roster(date ?? '', ctx) };
  }

  @Post('leave')
  @RequirePermission('hcm.manage')
  async requestLeave(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.workforce.requestLeave(parseBody(leaveSchema, body), ctx);
  }

  @Get('leave/status')
  @RequirePermission('hcm.read')
  async leaveStatus(@Query('key') key: string, @Ctx() ctx: RequestContext) {
    return this.workforce.leaveStatus(key ?? '', ctx);
  }

  @Post('employees/:id/certifications')
  @RequirePermission('hcm.manage')
  async setCertifications(
    @Param('id') id: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(certificationsSchema, body);
    return this.workforce.setCertifications(
      { employeeId: id, certifications: input.certifications },
      ctx,
    );
  }

  @Get('employees/:id/certifications')
  @RequirePermission('hcm.read')
  async certifications(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { certifications: await this.workforce.certifications(id, ctx) };
  }

  @Get('employees/:id/performance')
  @RequirePermission('hcm.read')
  async performance(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.workforce.performance(id, ctx);
  }

  @Post('payroll/export')
  @RequirePermission('hcm.manage')
  async payrollExport(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.workforce.payrollExport(parseBody(payrollExportSchema, body), ctx);
  }
}

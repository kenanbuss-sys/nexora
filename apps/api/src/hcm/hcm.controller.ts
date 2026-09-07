import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { EmployeeService } from '@nexora/domain-hcm';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const EMPLOYEE_SERVICE = 'EMPLOYEE_SERVICE';

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

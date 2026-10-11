import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { InstallationService } from '@nexora/domain-svc';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const INSTALLATION_SERVICE = 'INSTALLATION_SERVICE';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Sprint 248: site measurements, installations, crew/vehicle scheduling. */
@Controller('api/v1/service/visits')
export class InstallationController {
  constructor(@Inject(INSTALLATION_SERVICE) private readonly visits: InstallationService) {}

  @Post('measurements')
  @RequirePermission('service.manage')
  async measurement(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        accountId: z.string().uuid(),
        siteAddress: z.string().max(300).optional(),
        quoteId: z.string().uuid().optional(),
      }),
      body,
    );
    return this.visits.createMeasurement(input, ctx);
  }

  @Post('installations')
  @RequirePermission('service.manage')
  async installation(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        salesOrderId: z.string().uuid(),
        siteAddress: z.string().max(300).optional(),
      }),
      body,
    );
    return this.visits.createInstallation(input, ctx);
  }

  @Post(':id/schedule')
  @RequirePermission('service.manage')
  async schedule(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        slotStart: z.string().datetime(),
        slotEnd: z.string().datetime(),
        crewEmployeeIds: z.array(z.string().uuid()).min(1).max(10),
        vehicleId: z.string().uuid().optional(),
      }),
      body,
    );
    return this.visits.scheduleVisit(id, input, ctx);
  }

  /** Week board: ?from=YYYY-MM-DD&to=YYYY-MM-DD[&kind=INSTALLATION]. */
  @Get('schedule')
  @RequirePermission('service.read')
  async board(
    @Ctx() ctx: RequestContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('kind') kind?: string,
  ) {
    const q = parseBody(
      z.object({
        from: z.string().regex(DATE),
        to: z.string().regex(DATE),
        kind: z.enum(['SERVICE', 'MEASUREMENT', 'INSTALLATION']).optional(),
      }),
      { from, to, kind },
    );
    return {
      visits: await this.visits.schedule(
        { from: new Date(`${q.from}T00:00:00Z`), to: new Date(`${q.to}T00:00:00Z`), kind: q.kind },
        ctx,
      ),
    };
  }

  /** Open visits without a slot: ?kind=MEASUREMENT|INSTALLATION (default both). */
  @Get('open')
  @RequirePermission('service.read')
  async open(@Ctx() ctx: RequestContext, @Query('kind') kind?: string) {
    const parsed = kind
      ? parseBody(z.enum(['SERVICE', 'MEASUREMENT', 'INSTALLATION']), kind)
      : undefined;
    return { visits: await this.visits.unscheduled(parsed, ctx) };
  }

  @Get('by-order/:salesOrderId')
  @RequirePermission('service.read')
  async byOrder(@Param('salesOrderId') salesOrderId: string, @Ctx() ctx: RequestContext) {
    return { visits: await this.visits.forSalesOrder(salesOrderId, ctx) };
  }
}

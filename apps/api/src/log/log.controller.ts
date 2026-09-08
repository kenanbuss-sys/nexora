import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { LogisticsService } from '@nexora/domain-log';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const LOGISTICS_SERVICE = 'LOGISTICS_SERVICE';

const createShipmentSchema = z.object({
  carrierKey: z.string().min(2).max(40).optional(),
  vehicleId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  plannedAt: z.string().datetime().optional(),
  stops: z
    .array(z.object({ address: z.string().min(3).max(300), orderId: z.string().uuid().optional() }))
    .min(1)
    .max(100),
});

/** Fleet & drivers (LOG-004/005). */
@Controller('api/v1/logistics')
export class LogisticsController {
  constructor(@Inject(LOGISTICS_SERVICE) private readonly logistics: LogisticsService) {}

  @Get('vehicles')
  @RequirePermission('inventory.read')
  async vehicles(@Ctx() ctx: RequestContext) {
    return { vehicles: await this.logistics.listVehicles(ctx) };
  }

  @Post('vehicles')
  @RequirePermission('inventory.adjust')
  async createVehicle(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        plate: z.string().min(3).max(16),
        name: z.string().min(1).max(120),
        capacityKg: z.number().nonnegative().optional(),
      }),
      body,
    );
    return this.logistics.createVehicle(input, ctx);
  }

  @Get('drivers')
  @RequirePermission('inventory.read')
  async drivers(@Ctx() ctx: RequestContext) {
    return { drivers: await this.logistics.listDrivers(ctx) };
  }

  @Post('drivers')
  @RequirePermission('inventory.adjust')
  async createDriver(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({ name: z.string().min(2).max(120), licenseNo: z.string().max(40).optional() }),
      body,
    );
    return this.logistics.createDriver(input, ctx);
  }
}

/** Shipments (LOG-001/006/008/009). */
@Controller('api/v1/shipments')
export class ShipmentsController {
  constructor(@Inject(LOGISTICS_SERVICE) private readonly logistics: LogisticsService) {}

  @Get()
  @RequirePermission('inventory.read')
  async list(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    return {
      shipments: await this.logistics.listShipments(
        { status: (status || undefined) as never },
        ctx,
      ),
    };
  }

  @Post()
  @RequirePermission('inventory.adjust')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.logistics.createShipment(parseBody(createShipmentSchema, body), ctx);
  }

  @Get(':id')
  @RequirePermission('inventory.read')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.logistics.getShipment(id, ctx);
  }

  @Post(':id/dispatch')
  @RequirePermission('inventory.adjust')
  async dispatch(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.logistics.transition(id, 'DISPATCHED', {}, ctx);
  }

  @Post(':id/depart')
  @RequirePermission('inventory.adjust')
  async depart(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.logistics.transition(id, 'IN_TRANSIT', {}, ctx);
  }

  @Post(':id/deliver')
  @RequirePermission('inventory.adjust')
  async deliver(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.logistics.transition(id, 'DELIVERED', {}, ctx);
  }

  @Post(':id/exception')
  @RequirePermission('inventory.adjust')
  async exception(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(z.object({ reason: z.string().min(5).max(500) }), body);
    return this.logistics.transition(id, 'EXCEPTION', input, ctx);
  }

  @Post(':id/resume')
  @RequirePermission('inventory.adjust')
  async resume(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.logistics.transition(id, 'IN_TRANSIT', {}, ctx);
  }

  /** LOG-007 — load plan vs vehicle capacity. */
  @Get(':id/load-plan')
  @RequirePermission('inventory.read')
  async loadPlan(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.logistics.loadPlan(id, ctx);
  }

  /** LOG-010 — proof of delivery. */
  @Post(':id/pod')
  @RequirePermission('inventory.adjust')
  async pod(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({ name: z.string().min(2).max(120), pin: z.string().min(4).max(12) }),
      body,
    );
    return this.logistics.recordPod({ shipmentId: id, ...input }, ctx);
  }

  /** LOG-013 — freight cost. */
  @Post(':id/freight')
  @RequirePermission('inventory.adjust')
  async freight(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({ cost: z.number().nonnegative(), currency: z.string().length(3) }),
      body,
    );
    return this.logistics.setFreightCost({ shipmentId: id, ...input }, ctx);
  }

  @Get('reports/freight')
  @RequirePermission('inventory.read')
  async freightReport(@Ctx() ctx: RequestContext) {
    return { rows: await this.logistics.freightReport(ctx) };
  }

  @Get('reports/exceptions')
  @RequirePermission('inventory.read')
  async exceptions(@Ctx() ctx: RequestContext) {
    return this.logistics.exceptionsReport(ctx);
  }

  @Post(':id/stops/:stopId/complete')
  @RequirePermission('inventory.adjust')
  async completeStop(
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(
      z.object({ failed: z.boolean().optional(), note: z.string().max(300).optional() }),
      body ?? {},
    );
    return this.logistics.completeStop({ shipmentId: id, stopId, ...input }, ctx);
  }
}

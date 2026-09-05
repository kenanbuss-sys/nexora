import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import type { ShopFloorService } from '@nexora/domain-mes';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const SHOPFLOOR_SERVICE = 'SHOPFLOOR_SERVICE';

const createWorkCenterSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
});
const logDowntimeSchema = z.object({
  workCenterId: z.string().uuid(),
  category: z.enum(['BREAKDOWN', 'SETUP', 'MATERIAL', 'QUALITY', 'OTHER']),
  minutes: z.number().int().min(1).max(1440),
  reason: z.string().min(3).max(500),
  workOrderId: z.string().uuid().optional(),
});

/** Work centers, downtime and OEE inputs (MES-003/014/021). */
@Controller('api/v1/shopfloor')
export class ShopFloorController {
  constructor(@Inject(SHOPFLOOR_SERVICE) private readonly shopFloor: ShopFloorService) {}

  @Get('work-centers')
  @RequirePermission('production.read')
  async workCenters(@Ctx() ctx: RequestContext) {
    return { workCenters: await this.shopFloor.listWorkCenters(ctx) };
  }

  @Post('work-centers')
  @RequirePermission('production.manage')
  async createWorkCenter(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.shopFloor.createWorkCenter(parseBody(createWorkCenterSchema, body), ctx);
  }

  @Get('downtime')
  @RequirePermission('production.read')
  async downtime(@Ctx() ctx: RequestContext) {
    return { downtime: await this.shopFloor.listDowntime(ctx) };
  }

  @Post('downtime')
  @RequirePermission('production.execute')
  async logDowntime(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.shopFloor.logDowntime(parseBody(logDowntimeSchema, body), ctx);
  }

  @Get('oee')
  @RequirePermission('production.read')
  async oee(@Query('days') days: string | undefined, @Ctx() ctx: RequestContext) {
    return { rows: await this.shopFloor.oeeInputs(days ? Number(days) : 30, ctx) };
  }
}

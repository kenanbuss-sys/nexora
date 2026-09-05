import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { CountService } from '@nexora/domain-wms';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const COUNT_SERVICE = 'COUNT_SERVICE';

const createCountSchema = z.object({
  warehouseId: z.string().uuid(),
  note: z.string().max(500).optional(),
});
const recordLineSchema = z.object({
  skuId: z.string().uuid(),
  countedQty: z.number().min(0),
});

/** Stock counting (WMS-015/016). */
@Controller('api/v1/stock/counts')
export class CountsController {
  constructor(@Inject(COUNT_SERVICE) private readonly counts: CountService) {}

  @Get()
  @RequirePermission('inventory.count')
  async list(@Ctx() ctx: RequestContext) {
    return { counts: await this.counts.listCounts(ctx) };
  }

  @Post()
  @RequirePermission('inventory.count')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.counts.createCount(parseBody(createCountSchema, body), ctx);
  }

  @Post(':id/lines')
  @RequirePermission('inventory.count')
  async recordLine(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.counts.recordLine(id, parseBody(recordLineSchema, body), ctx);
  }

  @Post(':id/post')
  @RequirePermission('inventory.adjust.approve')
  async post(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.counts.postCount(id, ctx);
  }

  @Post(':id/cancel')
  @RequirePermission('inventory.count')
  async cancel(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.counts.cancelCount(id, ctx);
  }
}

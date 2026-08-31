import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { MesService } from '@nexora/domain-mes';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const MES_SERVICE = 'MES_SERVICE';

const createSchema = z.object({
  skuId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.number().positive(),
});
const completeSchema = z.object({
  goodQuantity: z.number().min(0),
  scrapQuantity: z.number().min(0).optional(),
});

@Controller('api/v1/work-orders')
export class WorkOrdersController {
  constructor(@Inject(MES_SERVICE) private readonly mes: MesService) {}

  @Get()
  @RequirePermission('production.read')
  async list(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    const params = parseBody(
      z.object({
        status: z
          .enum(['PLANNED', 'RELEASED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'])
          .optional(),
      }),
      { ...(status ? { status } : {}) },
    );
    return { workOrders: await this.mes.listWorkOrders(params, ctx) };
  }

  @Post()
  @RequirePermission('production.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.mes.createWorkOrder(parseBody(createSchema, body), ctx);
  }

  @Get(':id')
  @RequirePermission('production.read')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.mes.getWorkOrder(id, ctx);
  }

  @Post(':id/release')
  @RequirePermission('production.manage')
  async release(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.mes.releaseWorkOrder(id, ctx);
  }

  @Post(':id/start')
  @RequirePermission('production.execute')
  async start(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.mes.startWorkOrder(id, ctx);
  }

  @Post(':id/pause')
  @RequirePermission('production.execute')
  async pause(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.mes.pauseWorkOrder(id, ctx);
  }

  @Post(':id/operations/:opId/complete')
  @RequirePermission('production.execute')
  async completeOperation(
    @Param('id') id: string,
    @Param('opId') opId: string,
    @Ctx() ctx: RequestContext,
  ) {
    return this.mes.completeOperation(id, opId, ctx);
  }

  @Post(':id/complete')
  @RequirePermission('production.execute')
  async complete(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(completeSchema, body);
    return this.mes.completeWorkOrder({ workOrderId: id, ...input }, ctx);
  }

  @Post(':id/cancel')
  @RequirePermission('production.manage')
  async cancel(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.mes.cancelWorkOrder(id, ctx);
  }
}

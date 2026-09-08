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
const assignSchema = z.object({ workCenterCode: z.string().min(1).max(40) });
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

  @Get('production-by-day')
  @RequirePermission('production.read')
  async productionByDay(@Ctx() ctx: RequestContext, @Query('days') days?: string) {
    return { rows: await this.mes.productionByDay(days ? Number(days) || 7 : 7, ctx) };
  }

  @Get('where-used')
  @RequirePermission('production.read')
  async whereUsed(@Query('lot') lot: string, @Ctx() ctx: RequestContext) {
    return { workOrders: await this.mes.whereUsed(lot ?? '', ctx) };
  }

  @Get(':id/genealogy')
  @RequirePermission('production.read')
  async genealogy(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.mes.genealogy(id, ctx);
  }

  @Get('setup-report')
  @RequirePermission('production.read')
  async setupReport(@Ctx() ctx: RequestContext, @Query('days') days?: string) {
    return { report: await this.mes.setupReport(days ? Number(days) || 30 : 30, ctx) };
  }

  @Get(':id/operations/:opId/instructions')
  @RequirePermission('production.read')
  async instructions(
    @Param('id') id: string,
    @Param('opId') opId: string,
    @Ctx() ctx: RequestContext,
  ) {
    return this.mes.workInstructions({ workOrderId: id, operationId: opId }, ctx);
  }

  @Get('work-center-load')
  @RequirePermission('production.read')
  async workCenterLoad(@Ctx() ctx: RequestContext) {
    return { load: await this.mes.workCenterLoad(ctx) };
  }

  @Post(':id/operations/:opId/assign')
  @RequirePermission('production.manage')
  async assign(
    @Param('id') id: string,
    @Param('opId') opId: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(assignSchema, body);
    return this.mes.assignOperation(
      { workOrderId: id, operationId: opId, workCenterCode: input.workCenterCode },
      ctx,
    );
  }

  @Post(':id/operations/:opId/assign-operator')
  @RequirePermission('production.manage')
  async assignOperator(
    @Param('id') id: string,
    @Param('opId') opId: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(z.object({ userId: z.string().uuid() }), body);
    return this.mes.assignOperator(
      { workOrderId: id, operationId: opId, userId: input.userId },
      ctx,
    );
  }

  /** MES-005 — the calling operator's open queue (static beats :id). */
  @Get('my-operations')
  @RequirePermission('production.execute')
  async myOperations(@Ctx() ctx: RequestContext) {
    return { operations: await this.mes.myOperations(ctx) };
  }

  /** MES-024 — production confirmations. */
  @Post(':id/operations/:opId/confirm')
  @RequirePermission('production.execute')
  async confirmOperation(
    @Param('id') id: string,
    @Param('opId') opId: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(
      z.object({
        quantity: z.number().positive(),
        confirmationKey: z.string().min(1).max(64),
      }),
      body,
    );
    return this.mes.confirmOperation({ workOrderId: id, operationId: opId, ...input }, ctx);
  }

  /** MES-019 — drain offline-queued production confirmations. */
  @Post('offline/confirmations')
  @RequirePermission('production.execute')
  async applyOfflineConfirmations(@Ctx() ctx: RequestContext) {
    return this.mes.applyOfflineConfirmations(ctx);
  }

  @Post(':id/rework')
  @RequirePermission('production.manage')
  async rework(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.mes.createReworkOrder(id, ctx);
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

import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { FieldServiceService } from '@nexora/domain-svc';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const FIELD_SERVICE = 'FIELD_SERVICE';

const assetSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1).max(200),
  skuId: z.string().optional(),
  serial: z.string().max(120).optional(),
  location: z.string().max(200).optional(),
  installedAt: z.string().datetime().optional(),
  warrantyUntil: z.string().datetime().optional(),
});
const requestSchema = z.object({
  accountId: z.string().min(1),
  subject: z.string().min(1).max(200),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  installedAssetId: z.string().optional(),
});
const orderSchema = z.object({
  accountId: z.string().optional(),
  requestId: z.string().optional(),
  installedAssetId: z.string().optional(),
  skillsRequired: z.array(z.string().min(1).max(60)).max(20).optional(),
});
const scheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
  employeeId: z.string().min(1),
});
const measurementSchema = z.object({
  key: z.string().min(1).max(64),
  value: z.string().min(1).max(400),
  unit: z.string().max(20).optional(),
});
const partSchema = z.object({
  skuId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.number().positive(),
  key: z.string().min(1).max(64),
});
const proofSchema = z.object({
  name: z.string().min(1).max(120),
  pin: z.string().regex(/^\d{4,8}$/),
});
const completeSchema = z.object({
  report: z.string().min(5).max(4000),
  install: z
    .object({
      name: z.string().min(1).max(200),
      skuId: z.string().optional(),
      serial: z.string().max(120).optional(),
      warrantyMonths: z.number().int().min(0).max(120).optional(),
    })
    .optional(),
});
const cancelSchema = z.object({ reason: z.string().min(5).max(400) });
const rmaSchema = z.object({
  accountId: z.string().min(1),
  skuId: z.string().min(1),
  quantity: z.number().positive(),
  reason: z.string().min(5).max(400),
  orderId: z.string().optional(),
});
const rmaTransitionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'RECEIVED', 'CLOSED']),
  warehouseId: z.string().optional(),
});

/**
 * SVC — field service (SVC-001..015): installed base, warranty,
 * requests with SLA, orders with scheduling and skills-based
 * assignment, customer approvals, measurements, ledger-backed parts,
 * proof of service, installations, RMA and service history.
 */
@Controller('api/v1/service')
export class FieldServiceController {
  constructor(@Inject(FIELD_SERVICE) private readonly svc: FieldServiceService) {}

  @Post('assets')
  @RequirePermission('service.manage')
  async createAsset(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.svc.createInstalledAsset(parseBody(assetSchema, body), ctx);
  }

  @Get('assets')
  @RequirePermission('service.read')
  async installedBase(@Query('accountId') accountId: string, @Ctx() ctx: RequestContext) {
    return { assets: await this.svc.installedBase(accountId ?? '', ctx) };
  }

  @Get('assets/:id/history')
  @RequirePermission('service.read')
  async history(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.svc.history(id, ctx);
  }

  @Get('reports/warranty')
  @RequirePermission('service.read')
  async warrantyReport(@Ctx() ctx: RequestContext) {
    return this.svc.warrantyReport(ctx);
  }

  @Post('requests')
  @RequirePermission('service.manage')
  async createRequest(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.svc.createRequest(parseBody(requestSchema, body), ctx);
  }

  @Get('reports/sla')
  @RequirePermission('service.read')
  async slaReport(@Ctx() ctx: RequestContext) {
    return this.svc.slaReport(ctx);
  }

  @Post('orders')
  @RequirePermission('service.manage')
  async createOrder(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.svc.createOrder(parseBody(orderSchema, body), ctx);
  }

  @Get('orders/mine')
  @RequirePermission('service.read')
  async myOrders(@Ctx() ctx: RequestContext) {
    return { orders: await this.svc.myOrders(ctx) };
  }

  @Post('orders/:id/schedule')
  @RequirePermission('service.manage')
  async schedule(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.svc.schedule({ orderId: id, ...parseBody(scheduleSchema, body) }, ctx);
  }

  @Post('orders/:id/approval')
  @RequirePermission('service.manage')
  async requestApproval(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.svc.requestCustomerApproval(id, ctx);
  }

  @Post('orders/:id/start')
  @RequirePermission('service.manage')
  async start(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.svc.start(id, ctx);
  }

  @Post('orders/:id/measurements')
  @RequirePermission('service.manage')
  async recordMeasurement(
    @Param('id') id: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    return this.svc.recordMeasurement({ orderId: id, ...parseBody(measurementSchema, body) }, ctx);
  }

  @Get('orders/:id/measurements')
  @RequirePermission('service.read')
  async measurements(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { measurements: await this.svc.measurements(id, ctx) };
  }

  @Post('orders/:id/parts')
  @RequirePermission('service.manage')
  async addPart(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.svc.addPart({ orderId: id, ...parseBody(partSchema, body) }, ctx);
  }

  @Post('orders/:id/proof')
  @RequirePermission('service.manage')
  async recordProof(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.svc.recordProof({ orderId: id, ...parseBody(proofSchema, body) }, ctx);
  }

  @Post('orders/:id/complete')
  @RequirePermission('service.manage')
  async complete(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.svc.complete({ orderId: id, ...parseBody(completeSchema, body) }, ctx);
  }

  @Post('orders/:id/cancel')
  @RequirePermission('service.manage')
  async cancel(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(cancelSchema, body);
    return this.svc.cancel(id, input.reason, ctx);
  }

  @Post('rmas')
  @RequirePermission('service.manage')
  async createRma(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.svc.createRma(parseBody(rmaSchema, body), ctx);
  }

  @Post('rmas/:id/transition')
  @RequirePermission('service.manage')
  async transitionRma(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.svc.transitionRma({ rmaId: id, ...parseBody(rmaTransitionSchema, body) }, ctx);
  }
}

import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { PosService, OrderService } from '@nexora/domain-oms';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const ORDER_SERVICE = 'ORDER_SERVICE';
export const POS_SERVICE = 'POS_SERVICE';

const createOrderSchema = z.object({
  accountId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  currency: z.string().length(3),
  fulfillmentType: z.enum(['DELIVERY', 'PICKUP']).optional(),
  projectRef: z.string().max(120).optional(),
  channel: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{1,31}$/)
    .optional(),
});
const fromQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  warehouseId: z.string().uuid(),
});
const addLineSchema = z.object({
  skuId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});
const holdSchema = z.object({ reason: z.string().min(1).max(500) });
const confirmSchema = z.object({ allowBackorder: z.boolean().optional() });
const fulfillLinesSchema = z.object({
  shipKey: z.string().min(6).max(64),
  sourceWarehouseId: z.string().uuid().optional(),
  lines: z
    .array(z.object({ lineId: z.string().uuid(), quantity: z.number().positive() }))
    .min(1)
    .max(100),
});
const amendSchema = z.object({ quantity: z.number().positive() });
const endlessAisleSchema = z.object({
  accountId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  currency: z.string().length(3),
  lines: z
    .array(z.object({ code: z.string().min(1).max(64), quantity: z.number().positive() }))
    .min(1)
    .max(100),
  fulfillmentType: z.enum(['DELIVERY', 'PICKUP']).optional(),
});

@Controller('api/v1/orders')
export class OrdersController {
  constructor(@Inject(ORDER_SERVICE) private readonly orders: OrderService) {}

  @Get()
  @RequirePermission('order.read')
  async list(
    @Ctx() ctx: RequestContext,
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
  ) {
    const params = parseBody(
      z.object({
        accountId: z.string().uuid().optional(),
        status: z.enum(['DRAFT', 'CONFIRMED', 'ON_HOLD', 'FULFILLED', 'CANCELLED']).optional(),
      }),
      { ...(accountId ? { accountId } : {}), ...(status ? { status } : {}) },
    );
    return { orders: await this.orders.listOrders(params, ctx) };
  }

  @Get('overdue')
  @RequirePermission('order.read')
  async overdue(@Ctx() ctx: RequestContext, @Query('days') days?: string) {
    const slaDays = days ? Math.max(1, Math.min(90, Number(days) || 3)) : 3;
    return { slaDays, orders: await this.orders.overdueFulfillments(slaDays, ctx) };
  }

  @Post()
  @RequirePermission('order.create')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.orders.createOrder(parseBody(createOrderSchema, body), ctx);
  }

  /** COM-006 — channel attribution mix. */
  @Get('channel-mix')
  @RequirePermission('order.read')
  async channelMix(@Ctx() ctx: RequestContext) {
    return { mix: await this.orders.channelMix(ctx) };
  }

  @Get('abandoned')
  @RequirePermission('order.read')
  async abandoned(@Query('hours') hours: string, @Ctx() ctx: RequestContext) {
    const parsed = Number(hours);
    return {
      orders: await this.orders.reportAbandoned(Number.isFinite(parsed) ? parsed : 24, ctx),
    };
  }

  @Post('abandoned/notify')
  @RequirePermission('order.confirm')
  async notifyAbandoned(@Query('hours') hours: string, @Ctx() ctx: RequestContext) {
    const parsed = Number(hours);
    return this.orders.notifyAbandoned(Number.isFinite(parsed) ? parsed : 24, ctx);
  }

  @Post(':id/ready-for-pickup')
  @RequirePermission('order.confirm')
  async readyForPickup(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.orders.readyForPickup(id, ctx);
  }

  @Post(':id/fulfill-lines')
  @RequirePermission('order.confirm')
  async fulfillLines(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(fulfillLinesSchema, body);
    return this.orders.fulfillLines({ orderId: id, ...input }, ctx);
  }

  @Post('allocate-backorders')
  @RequirePermission('order.confirm')
  async allocateBackorders(@Ctx() ctx: RequestContext) {
    return { report: await this.orders.allocateBackorders(ctx) };
  }

  @Post('endless-aisle')
  @RequirePermission('order.create')
  async endlessAisle(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.orders.endlessAisle(parseBody(endlessAisleSchema, body), ctx);
  }

  @Post('quick')
  @RequirePermission('order.create')
  async quick(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        accountId: z.string().uuid(),
        warehouseId: z.string().uuid(),
        currency: z.string().length(3),
        lines: z
          .array(z.object({ code: z.string().min(1).max(64), quantity: z.number().positive() }))
          .min(1)
          .max(100),
      }),
      body,
    );
    return this.orders.quickOrder(input, ctx);
  }

  @Post('from-quote')
  @RequirePermission('order.create')
  async fromQuote(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.orders.createFromQuote(parseBody(fromQuoteSchema, body), ctx);
  }

  @Get(':id/promise')
  @RequirePermission('order.read')
  async promise(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.orders.promiseDates(id, ctx);
  }

  @Get(':id/logistics')
  @RequirePermission('order.read')
  async logistics(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.orders.logisticsSummary(id, ctx);
  }

  @Get(':id')
  @RequirePermission('order.read')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.orders.getOrder(id, ctx);
  }

  @Get(':id/timeline')
  @RequirePermission('order.read')
  async timeline(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { events: await this.orders.getTimeline(id, ctx) };
  }

  @Post(':id/lines')
  @RequirePermission('order.create')
  async addLine(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(addLineSchema, body);
    return this.orders.addLine({ orderId: id, ...input }, ctx);
  }

  @Post(':id/apply-promotion')
  @RequirePermission('order.create')
  async applyPromotion(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(z.object({ code: z.string().min(1).max(64) }), body);
    return this.orders.applyPromotion(id, input.code, ctx);
  }

  @Post(':id/repeat')
  @RequirePermission('order.create')
  async repeat(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.orders.repeatOrder(id, ctx);
  }

  @Post(':id/lines/:lineId/substitute')
  @RequirePermission('order.create')
  async substitute(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(z.object({ substituteSkuId: z.string().uuid() }), body);
    return this.orders.substituteLine(id, lineId, input.substituteSkuId, ctx);
  }

  @Post(':id/confirm')
  @RequirePermission('order.confirm')
  async confirm(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const options = parseBody(confirmSchema, body ?? {});
    return this.orders.confirmOrder(id, ctx, options);
  }

  @Post(':id/release-backorders')
  @RequirePermission('order.confirm')
  async releaseBackorders(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.orders.releaseBackorders(id, ctx);
  }

  @Post(':id/lines/:lineId/amend')
  @RequirePermission('order.confirm')
  async amendLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    return this.orders.amendLine(id, lineId, parseBody(amendSchema, body), ctx);
  }

  @Post(':id/hold')
  @RequirePermission('order.hold')
  async hold(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const { reason } = parseBody(holdSchema, body);
    return this.orders.holdOrder(id, reason, ctx);
  }

  @Post(':id/release')
  @RequirePermission('order.hold')
  async release(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.orders.releaseOrder(id, ctx);
  }

  @Post(':id/cancel')
  @RequirePermission('order.cancel')
  async cancel(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.orders.cancelOrder(id, ctx);
  }

  @Post(':id/fulfill')
  @RequirePermission('order.confirm')
  async fulfill(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.orders.fulfillOrder(id, ctx);
  }
}

const posSaleSchema = z.object({
  accountId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  currency: z.string().length(3),
  lines: z
    .array(z.object({ code: z.string().min(1).max(64), quantity: z.number().positive() }))
    .min(1)
    .max(100),
  cashAmount: z.number().nonnegative(),
});

/** Point of sale (COM-003). */
@Controller('api/v1/pos/sessions')
export class PosController {
  constructor(@Inject(POS_SERVICE) private readonly pos: PosService) {}

  @Get()
  @RequirePermission('order.read')
  async list(@Ctx() ctx: RequestContext) {
    return { sessions: await this.pos.listSessions(ctx) };
  }

  @Post()
  @RequirePermission('order.create')
  async open(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        registerCode: z.string().min(2).max(32),
        openingFloat: z.number().nonnegative().optional(),
      }),
      body,
    );
    return this.pos.openSession(input, ctx);
  }

  @Post(':id/sales')
  @RequirePermission('order.create')
  async sale(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(posSaleSchema, body);
    return this.pos.recordSale({ sessionId: id, ...input }, ctx);
  }

  @Post(':id/close')
  @RequirePermission('order.create')
  async close(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(z.object({ closingCount: z.number().nonnegative() }), body);
    return this.pos.closeSession({ sessionId: id, ...input }, ctx);
  }
}

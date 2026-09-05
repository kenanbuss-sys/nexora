import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { OrderService } from '@nexora/domain-oms';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const ORDER_SERVICE = 'ORDER_SERVICE';

const createOrderSchema = z.object({
  accountId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  currency: z.string().length(3),
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
const amendSchema = z.object({ quantity: z.number().positive() });

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

  @Post()
  @RequirePermission('order.create')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.orders.createOrder(parseBody(createOrderSchema, body), ctx);
  }

  @Post('from-quote')
  @RequirePermission('order.create')
  async fromQuote(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.orders.createFromQuote(parseBody(fromQuoteSchema, body), ctx);
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

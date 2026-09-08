import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Param,
  Req,
} from '@nestjs/common';
import type { PortalService } from '@nexora/domain-b2b';
import type { OrderService } from '@nexora/domain-oms';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { ORDER_SERVICE } from '../oms/orders.controller';
import { parseBody } from '../common/validate';

export const PORTAL_SERVICE = 'PORTAL_SERVICE';

const decideOrderSchema = z.object({
  approve: z.boolean(),
  reason: z.string().max(300).optional(),
});
const claimSchema = z.object({
  orderId: z.string().uuid(),
  subject: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
});
const placeOrderSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  currency: z.string().length(3).optional(),
  lines: z
    .array(z.object({ skuId: z.string().uuid(), quantity: z.number().positive() }))
    .min(1)
    .max(50),
});

const addPortalUserSchema = z.object({
  accountId: z.string().uuid(),
  idpSubject: z.string().min(1).max(200),
  displayName: z.string().min(1).max(200),
  email: z.string().email().optional(),
});

/** Back-office management of portal users. */
@Controller('api/v1/portal-users')
export class PortalUsersController {
  constructor(@Inject(PORTAL_SERVICE) private readonly portal: PortalService) {}

  @Get()
  @RequirePermission('portal.manage')
  async list(@Ctx() ctx: RequestContext) {
    return { portalUsers: await this.portal.listPortalUsers(ctx) };
  }

  @Post()
  @RequirePermission('portal.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.portal.addPortalUser(parseBody(addPortalUserSchema, body), ctx);
  }

  @Post(':id/disable')
  @RequirePermission('portal.manage')
  async disable(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    await this.portal.setPortalUserStatus(id, 'DISABLED', ctx);
    return { ok: true };
  }

  @Post(':id/activate')
  @RequirePermission('portal.manage')
  async activate(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    await this.portal.setPortalUserStatus(id, 'ACTIVE', ctx);
    return { ok: true };
  }
}

/** Customer self-service: everything scoped to the caller's account. */
@Controller('api/v1/portal')
export class PortalController {
  constructor(@Inject(PORTAL_SERVICE) private readonly portal: PortalService) {}

  @Get('me')
  @RequirePermission('portal.access')
  async me(@Ctx() ctx: RequestContext) {
    const context = await this.portal.resolvePortalContext(ctx);
    const credit = await this.portal.myCredit(ctx);
    return { ...context, credit };
  }

  @Get('catalog')
  @RequirePermission('portal.access')
  async catalog(@Ctx() ctx: RequestContext) {
    return { catalog: await this.portal.myCatalog(ctx) };
  }

  @Post('orders')
  @RequirePermission('portal.access')
  async placeOrder(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(placeOrderSchema, body);
    return this.portal.placeOrder(input, ctx);
  }

  @Get('orders')
  @RequirePermission('portal.access')
  async orders(@Ctx() ctx: RequestContext) {
    return { orders: await this.portal.myOrders(ctx) };
  }

  @Get('orders/:id/timeline')
  @RequirePermission('portal.access')
  async timeline(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { events: await this.portal.myOrderTimeline(id, ctx) };
  }

  @Post('claims')
  @RequirePermission('portal.access')
  async fileClaim(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.portal.fileClaim(parseBody(claimSchema, body), ctx);
  }

  @Post('orders/:id/decide')
  @RequirePermission('portal.access')
  async decideOrder(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(decideOrderSchema, body);
    return this.portal.decideOrder({ orderId: id, ...input }, ctx);
  }

  @Get('claims')
  @RequirePermission('portal.access')
  async myClaims(@Ctx() ctx: RequestContext) {
    return { claims: await this.portal.myClaims(ctx) };
  }

  @Get('quotes')
  @RequirePermission('portal.access')
  async quotes(@Ctx() ctx: RequestContext) {
    return { quotes: await this.portal.myQuotes(ctx) };
  }

  @Get('invoices')
  @RequirePermission('portal.access')
  async invoices(@Ctx() ctx: RequestContext) {
    return { invoices: await this.portal.myInvoices(ctx) };
  }
}

const customerOrderSchema = z.object({
  lines: z
    .array(z.object({ code: z.string().min(1).max(64), quantity: z.number().positive() }))
    .min(1)
    .max(100),
  currency: z.string().length(3).optional(),
});

/**
 * Customer API access (B2B-014): endpoints for account-bound API keys.
 * The acting account comes from the key itself — never from the
 * request — so a customer key can only ever see and order for the
 * account it was issued to.
 */
@Controller('api/v1/b2b/my')
export class CustomerApiController {
  constructor(@Inject(ORDER_SERVICE) private readonly orders: OrderService) {}

  private accountOf(request: AuthenticatedRequest): string {
    const accountId = request.apiKeyAccountId;
    if (!accountId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'This endpoint requires a customer-bound API key',
      });
    }
    return accountId;
  }

  @Get('orders')
  @RequirePermission('order.read')
  async myOrders(@Req() request: AuthenticatedRequest, @Ctx() ctx: RequestContext) {
    const accountId = this.accountOf(request);
    return { orders: await this.orders.listOrders({ accountId }, ctx) };
  }

  @Post('orders')
  @RequirePermission('order.create')
  async placeOrder(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const accountId = this.accountOf(request);
    const input = parseBody(customerOrderSchema, body);
    const warehouse = await this.orders.defaultWarehouse(ctx);
    const result = await this.orders.quickOrder(
      {
        accountId,
        warehouseId: warehouse,
        currency: input.currency ?? 'EUR',
        lines: input.lines,
        channel: 'api',
      },
      ctx,
    );
    return { order: result.order, unknownCodes: result.unknownCodes };
  }
}

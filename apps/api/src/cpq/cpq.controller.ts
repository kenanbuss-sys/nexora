import { Body, Controller, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import type { PricingService, QuoteService } from '@nexora/domain-cpq';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const PRICING_SERVICE = 'PRICING_SERVICE';
export const QUOTE_SERVICE = 'QUOTE_SERVICE';

const createPriceListSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  currency: z.string().length(3),
});
const setPriceSchema = z.object({
  skuId: z.string().uuid(),
  minQty: z.number().positive().optional(),
  unitPrice: z.number().nonnegative(),
});
const createQuoteSchema = z.object({
  accountId: z.string().uuid(),
  priceListId: z.string().uuid(),
  opportunityId: z.string().uuid().optional(),
  validUntil: z.string().datetime().optional(),
});
const addLineSchema = z.object({
  skuId: z.string().uuid(),
  quantity: z.number().positive(),
  discountPct: z.number().min(0).max(100).optional(),
});

@Controller('api/v1/price-lists')
export class PriceListsController {
  constructor(@Inject(PRICING_SERVICE) private readonly pricing: PricingService) {}

  @Get()
  @RequirePermission('pricing.read')
  async list(@Ctx() ctx: RequestContext) {
    return { priceLists: await this.pricing.listPriceLists(ctx) };
  }

  @Post()
  @RequirePermission('pricing.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.pricing.createPriceList(parseBody(createPriceListSchema, body), ctx);
  }

  @Get(':id/entries')
  @RequirePermission('pricing.read')
  async entries(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { entries: await this.pricing.getEntries(id, ctx) };
  }

  @Put(':id/entries')
  @RequirePermission('pricing.manage')
  async setPrice(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(setPriceSchema, body);
    return this.pricing.setPrice({ priceListId: id, ...input }, ctx);
  }

  @Post(':id/publish')
  @RequirePermission('pricing.manage')
  async publish(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.pricing.publishPriceList(id, ctx);
  }
}

@Controller('api/v1/quotes')
export class QuotesController {
  constructor(@Inject(QUOTE_SERVICE) private readonly quotes: QuoteService) {}

  @Get()
  @RequirePermission('quote.read')
  async list(
    @Ctx() ctx: RequestContext,
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
  ) {
    const params = parseBody(
      z.object({
        accountId: z.string().uuid().optional(),
        status: z
          .enum([
            'DRAFT',
            'PENDING_APPROVAL',
            'APPROVED',
            'SENT',
            'ACCEPTED',
            'REJECTED',
            'EXPIRED',
          ])
          .optional(),
      }),
      { ...(accountId ? { accountId } : {}), ...(status ? { status } : {}) },
    );
    return { quotes: await this.quotes.listQuotes(params, ctx) };
  }

  @Post()
  @RequirePermission('quote.create')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.quotes.createQuote(parseBody(createQuoteSchema, body), ctx);
  }

  @Get(':id')
  @RequirePermission('quote.read')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.quotes.getQuote(id, ctx);
  }

  @Post(':id/lines')
  @RequirePermission('quote.create')
  async addLine(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(addLineSchema, body);
    return this.quotes.addLine({ quoteId: id, ...input }, ctx);
  }

  @Post(':id/submit')
  @RequirePermission('quote.create')
  async submit(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.quotes.submitQuote(id, ctx);
  }

  @Post(':id/sync-approval')
  @RequirePermission('quote.read')
  async syncApproval(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.quotes.syncApproval(id, ctx);
  }

  @Post(':id/send')
  @RequirePermission('quote.create')
  async send(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.quotes.sendQuote(id, ctx);
  }

  @Post(':id/accept')
  @RequirePermission('quote.create')
  async accept(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.quotes.decideQuote(id, true, ctx);
  }

  @Post(':id/reject')
  @RequirePermission('quote.create')
  async reject(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.quotes.decideQuote(id, false, ctx);
  }

  @Post(':id/new-version')
  @RequirePermission('quote.create')
  async newVersion(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.quotes.newVersion(id, ctx);
  }
}

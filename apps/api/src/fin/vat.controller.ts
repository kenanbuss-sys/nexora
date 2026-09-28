import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { VAT_BOOK_TYPES, type VatService } from '@nexora/domain-fin';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const VAT_SERVICE = 'VAT_SERVICE';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const LE = z.string().uuid();
const periodSchema = z.object({
  legalEntityId: LE,
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
const rateSchema = z.object({
  legalEntityId: LE,
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  ratePct: z.number().min(0).max(100),
  validFrom: DATE,
});
const entrySchema = z.object({
  legalEntityId: LE,
  bookType: z.enum(VAT_BOOK_TYPES),
  requestKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,80}$/),
  documentNumber: z.string().min(1).max(60),
  documentDate: DATE,
  bookingDate: DATE,
  partnerId: z.string().uuid(),
  vatRateCode: z.string().min(1).max(20),
  netAmount: z.number().positive().max(1e12),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  counterAccountId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
});
const stornoSchema = z.object({ reason: z.string().min(5).max(400) });
const paidSchema = periodSchema.extend({
  paidAt: DATE,
  reference: z.string().min(1).max(120),
});

/**
 * FIN-028 (Sprint 232) — KUF/KIF books and VAT periods (BiH pack).
 * Reads need finance.ledger.read; recording/storno finance.ledger.post;
 * rate configuration, filing and payment status finance.ledger.manage.
 */
@Controller('api/v1/vat')
export class VatController {
  constructor(@Inject(VAT_SERVICE) private readonly vat: VatService) {}

  @Get('rates')
  @RequirePermission('finance.ledger.read')
  async rates(@Query('legalEntityId') legalEntityId: string, @Ctx() ctx: RequestContext) {
    return { rates: await this.vat.listRates(parseBody(LE, legalEntityId), ctx) };
  }

  @Post('rates')
  @RequirePermission('finance.ledger.manage')
  async addRate(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.vat.addRate(parseBody(rateSchema, body), ctx);
  }

  @Post('pack/bih')
  @RequirePermission('finance.ledger.manage')
  async installPack(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(z.object({ legalEntityId: LE }), body);
    return this.vat.installBihPack(input.legalEntityId, ctx);
  }

  @Get('books')
  @RequirePermission('finance.ledger.read')
  async book(
    @Query('legalEntityId') legalEntityId: string,
    @Query('bookType') bookType: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Ctx() ctx: RequestContext,
  ) {
    const q = parseBody(periodSchema.extend({ bookType: z.enum(VAT_BOOK_TYPES) }), {
      legalEntityId,
      bookType,
      year,
      month,
    });
    return this.vat.book(q, ctx);
  }

  @Post('entries')
  @RequirePermission('finance.ledger.post')
  async record(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.vat.record(parseBody(entrySchema, body), ctx);
  }

  @Get('entries/:id')
  @RequirePermission('finance.ledger.read')
  async view(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.vat.view(parseBody(z.string().uuid(), id), ctx);
  }

  @Post('entries/:id/storno')
  @RequirePermission('finance.ledger.post')
  async storno(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(stornoSchema, body);
    return this.vat.storno(parseBody(z.string().uuid(), id), input.reason, ctx);
  }

  @Get('periods')
  @RequirePermission('finance.ledger.read')
  async periods(@Query('legalEntityId') legalEntityId: string, @Ctx() ctx: RequestContext) {
    return { periods: await this.vat.listPeriods(parseBody(LE, legalEntityId), ctx) };
  }

  @Get('periods/summary')
  @RequirePermission('finance.ledger.read')
  async summary(
    @Query('legalEntityId') legalEntityId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Ctx() ctx: RequestContext,
  ) {
    return this.vat.period(parseBody(periodSchema, { legalEntityId, year, month }), ctx);
  }

  @Post('periods/file')
  @RequirePermission('finance.ledger.manage')
  async file(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.vat.file(parseBody(periodSchema, body), ctx);
  }

  @Post('periods/paid')
  @RequirePermission('finance.ledger.manage')
  async paid(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.vat.markPaid(parseBody(paidSchema, body), ctx);
  }
}

import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { FinanceService, TreasuryService } from '@nexora/domain-fin';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const FINANCE_SERVICE = 'FINANCE_SERVICE';
export const TREASURY_SERVICE = 'TREASURY_SERVICE';

const customerInvoiceSchema = z.object({
  orderId: z.string().uuid(),
  dueInDays: z.number().int().min(0).max(365).optional(),
});
const supplierInvoiceSchema = z.object({
  poId: z.string().uuid(),
  dueInDays: z.number().int().min(0).max(365).optional(),
});
const paymentSchema = z.object({
  amount: z.number().positive(),
  reference: z.string().max(200).optional(),
});
const costCenterSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(200),
});
const budgetSchema = z.object({
  costCenterId: z.string().uuid(),
  periodKey: z.string().min(4).max(7),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
});
const assignCostCenterSchema = z.object({ costCenterId: z.string().uuid() });

@Controller('api/v1/finance')
export class FinanceController {
  constructor(@Inject(FINANCE_SERVICE) private readonly finance: FinanceService) {}

  @Get('invoices')
  @RequirePermission('finance.read')
  async invoices(@Ctx() ctx: RequestContext, @Query('type') type?: string) {
    const params = parseBody(z.object({ type: z.enum(['CUSTOMER', 'SUPPLIER']).optional() }), {
      ...(type ? { type } : {}),
    });
    return { invoices: await this.finance.listInvoices({ invoiceType: params.type }, ctx) };
  }

  @Post('invoices/customer')
  @RequirePermission('finance.invoice')
  async customerInvoice(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.finance.createCustomerInvoice(parseBody(customerInvoiceSchema, body), ctx);
  }

  @Post('invoices/supplier')
  @RequirePermission('finance.invoice')
  async supplierInvoice(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.finance.createSupplierInvoice(parseBody(supplierInvoiceSchema, body), ctx);
  }

  @Get('invoices/:id/payments')
  @RequirePermission('finance.read')
  async payments(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return { payments: await this.finance.listPayments(id, ctx) };
  }

  @Post('invoices/:id/payments')
  @RequirePermission('finance.pay')
  async recordPayment(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(paymentSchema, body);
    return this.finance.recordPayment({ invoiceId: id, ...input }, ctx);
  }

  @Get('margin')
  @RequirePermission('finance.read')
  async margin(@Ctx() ctx: RequestContext) {
    return { rows: await this.finance.marginAnalysis(ctx) };
  }

  @Get('pnl')
  @RequirePermission('finance.read')
  async pnl(@Ctx() ctx: RequestContext) {
    return this.finance.pnl(ctx);
  }
}

/** Cost centers, budgets, aging and cash flow (Sprint 019). */
@Controller('api/v1/finance')
export class TreasuryController {
  constructor(@Inject(TREASURY_SERVICE) private readonly treasury: TreasuryService) {}

  @Get('cost-centers')
  @RequirePermission('finance.read')
  async costCenters(@Ctx() ctx: RequestContext) {
    return { costCenters: await this.treasury.listCostCenters(ctx) };
  }

  @Post('cost-centers')
  @RequirePermission('finance.manage')
  async createCostCenter(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.treasury.createCostCenter(parseBody(costCenterSchema, body), ctx);
  }

  @Post('budgets')
  @RequirePermission('finance.manage')
  async setBudget(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    await this.treasury.setBudget(parseBody(budgetSchema, body), ctx);
    return { ok: true };
  }

  @Get('budgets')
  @RequirePermission('finance.read')
  async budgetReport(@Query('period') period: string, @Ctx() ctx: RequestContext) {
    return { rows: await this.treasury.budgetReport(period ?? '', ctx) };
  }

  @Post('invoices/:id/cost-center')
  @RequirePermission('finance.manage')
  async assign(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const { costCenterId } = parseBody(assignCostCenterSchema, body);
    await this.treasury.assignInvoiceCostCenter(id, costCenterId, ctx);
    return { ok: true };
  }

  @Get('aging')
  @RequirePermission('finance.read')
  async aging(@Query('type') type: string, @Ctx() ctx: RequestContext) {
    const parsed = parseBody(z.object({ type: z.enum(['CUSTOMER', 'SUPPLIER']) }), {
      type: type ?? 'CUSTOMER',
    });
    return this.treasury.aging(parsed.type, ctx);
  }

  @Get('cashflow')
  @RequirePermission('finance.read')
  async cashflow(@Query('months') months: string | undefined, @Ctx() ctx: RequestContext) {
    return { rows: await this.treasury.cashflow(months ? Number(months) : 6, ctx) };
  }
}

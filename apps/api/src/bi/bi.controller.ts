import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import type { AnalyticsService } from '@nexora/domain-bi';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const ANALYTICS_SERVICE = 'ANALYTICS_SERVICE';

@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(@Inject(ANALYTICS_SERVICE) private readonly analytics: AnalyticsService) {}

  /** BI-015 — governed data export (audited, permissioned). */
  @Get('export')
  @RequirePermission('analytics.export')
  async exportDataset(@Ctx() ctx: RequestContext, @Query('dataset') dataset?: string) {
    const input = parseBody(
      z.object({ dataset: z.enum(['orders', 'invoices', 'stock_movements']) }),
      { dataset },
    );
    return this.analytics.exportDataset(input.dataset, ctx);
  }

  @Get('kpis')
  @RequirePermission('analytics.read')
  kpis() {
    return { kpis: this.analytics.kpiCatalog() };
  }

  @Get('control-center')
  @RequirePermission('analytics.read')
  async controlCenter(@Ctx() ctx: RequestContext) {
    return this.analytics.controlCenter(ctx);
  }

  @Get('executive')
  @RequirePermission('analytics.read')
  async executive(@Ctx() ctx: RequestContext) {
    return this.analytics.executiveSummary(ctx);
  }

  @Get('inventory')
  @RequirePermission('analytics.read')
  async inventory(@Ctx() ctx: RequestContext) {
    return { rows: await this.analytics.inventoryAnalytics(ctx) };
  }

  @Get('manufacturing')
  @RequirePermission('analytics.read')
  async manufacturing(@Ctx() ctx: RequestContext) {
    return this.analytics.manufacturingAnalytics(ctx);
  }

  /** BI-012 — supplier scorecard. */
  @Get('suppliers')
  @RequirePermission('analytics.read')
  async suppliers(@Ctx() ctx: RequestContext) {
    return { rows: await this.analytics.supplierAnalytics(ctx) };
  }

  /** BI-013 — process cycle times. */
  @Get('processes')
  @RequirePermission('analytics.read')
  async processes(@Ctx() ctx: RequestContext) {
    return { rows: await this.analytics.processAnalytics(ctx) };
  }

  /** BI-008 — profitability per channel. */
  @Get('profitability')
  @RequirePermission('analytics.read')
  async profitability(@Ctx() ctx: RequestContext) {
    return { rows: await this.analytics.profitabilityAnalytics(ctx) };
  }

  /** BI-006 — run configured scheduled reports (cron/worker or manual). */
  @Post('reports/run')
  @RequirePermission('analytics.export')
  async runReports(@Ctx() ctx: RequestContext) {
    return this.analytics.runScheduledReports(ctx);
  }

  /** BI-004 — the governed semantic model. */
  @Get('semantic-model')
  @RequirePermission('analytics.read')
  semanticModel() {
    return { model: this.analytics.semanticModel() };
  }

  /** BI-005 — report builder over modeled dimensions and measures. */
  @Post('reports')
  @RequirePermission('analytics.read')
  async runReport(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        dataset: z.enum(['orders', 'invoices']),
        groupBy: z.string().min(1).max(40),
        measure: z.string().min(1).max(40),
      }),
      body,
    );
    return { rows: await this.analytics.runReport(input, ctx) };
  }

  /** BI-007 — drill-through to the records behind one grouped row. */
  @Post('reports/drill')
  @RequirePermission('analytics.read')
  async drill(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(
      z.object({
        dataset: z.enum(['orders', 'invoices']),
        groupBy: z.string().min(1).max(40),
        groupValue: z.string().min(1).max(100),
      }),
      body,
    );
    return { rows: await this.analytics.drillThrough(input, ctx) };
  }

  @Get('customers')
  @RequirePermission('analytics.read')
  async customers(@Ctx() ctx: RequestContext) {
    return { rows: await this.analytics.customerAnalytics(ctx) };
  }
}

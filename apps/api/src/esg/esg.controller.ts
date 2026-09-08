import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { EsgService } from '@nexora/domain-esg';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const ESG_SERVICE = 'ESG_SERVICE';

const PERIOD = z.string().regex(/^\d{4}-\d{2}$/);
const energySchema = z.object({
  facility: z.string().min(1).max(64),
  period: PERIOD,
  source: z.string().min(1).max(64),
  kwh: z.number().nonnegative(),
});
const wasteSchema = z.object({
  facility: z.string().min(1).max(64),
  period: PERIOD,
  kind: z.string().min(1).max(64),
  kg: z.number().nonnegative(),
  disposal: z.enum(['recikliranje', 'deponija', 'spaljivanje', 'povrat']),
});
const supplierRatingSchema = z.object({
  supplierId: z.string().min(1),
  score: z.number().int().min(1).max(5),
  certification: z.string().max(120).optional(),
});
const exportSchema = z.object({
  connectorKey: z.string().min(1).max(60),
  period: PERIOD,
});

/**
 * ESG — sustainability (ESG-001..010): energy, waste, emissions,
 * materials, KPIs and targets, supplier ratings, compliance evidence,
 * reporting exports and analytics.
 */
@Controller('api/v1/esg')
export class EsgController {
  constructor(@Inject(ESG_SERVICE) private readonly esg: EsgService) {}

  @Post('setup')
  @RequirePermission('configuration.publish')
  async setup(@Ctx() ctx: RequestContext) {
    return this.esg.setup(ctx);
  }

  @Post('energy')
  @RequirePermission('organization.manage')
  async energy(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.esg.recordEnergy(parseBody(energySchema, body), ctx);
  }

  @Post('waste')
  @RequirePermission('organization.manage')
  async waste(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.esg.recordWaste(parseBody(wasteSchema, body), ctx);
  }

  @Get('materials')
  @RequirePermission('organization.read')
  async materials(@Ctx() ctx: RequestContext) {
    return { materials: await this.esg.materials(ctx) };
  }

  @Get('kpis')
  @RequirePermission('organization.read')
  async kpis(@Ctx() ctx: RequestContext) {
    return { kpis: await this.esg.kpis(ctx) };
  }

  @Get('targets/:period')
  @RequirePermission('organization.read')
  async targets(@Param('period') period: string, @Ctx() ctx: RequestContext) {
    return { targets: await this.esg.targets(period, ctx) };
  }

  @Get('emissions/:period')
  @RequirePermission('organization.read')
  async emissions(@Param('period') period: string, @Ctx() ctx: RequestContext) {
    return this.esg.emissions(period, ctx);
  }

  @Post('suppliers/rating')
  @RequirePermission('organization.manage')
  async rateSupplier(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.esg.rateSupplier(parseBody(supplierRatingSchema, body), ctx);
  }

  @Get('suppliers/ratings')
  @RequirePermission('organization.read')
  async supplierRatings(@Ctx() ctx: RequestContext) {
    return { ratings: await this.esg.supplierRatings(ctx) };
  }

  @Get('evidence')
  @RequirePermission('organization.read')
  async evidence(@Ctx() ctx: RequestContext) {
    return { evidence: await this.esg.evidence(ctx) };
  }

  @Post('reports/export')
  @RequirePermission('organization.manage')
  async exportReport(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.esg.exportReport(parseBody(exportSchema, body), ctx);
  }

  @Get('analytics/:period')
  @RequirePermission('organization.read')
  async analytics(@Param('period') period: string, @Ctx() ctx: RequestContext) {
    return this.esg.analytics(period, ctx);
  }
}

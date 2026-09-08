import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { MarketingService } from '@nexora/domain-mkt';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const MARKETING_SERVICE = 'MARKETING_SERVICE';

const buildListSchema = z.object({ segmentKey: z.string().min(1).max(60) });
const consentSchema = z.object({
  accountId: z.string().min(1),
  channel: z.enum(['email', 'sms', 'push']),
  granted: z.boolean(),
});
const sendSchema = z.object({
  step: z.string().min(1).max(64),
  segmentKey: z.string().min(1).max(60),
  connectorKey: z.string().min(1).max(60),
});
const formSchema = z.object({
  formKey: z.string().min(1).max(60),
  submissionId: z.string().min(1).max(64),
  values: z.record(z.string(), z.string().max(400)),
});
const couponSchema = z.object({ code: z.string().min(1).max(60) });
const promoSchema = z.object({ priceListId: z.string().min(1) });
const attributionSchema = z.object({ orderId: z.string().min(1) });
const variantSchema = z.object({ subjectId: z.string().min(1).max(120) });

/**
 * MKT — marketing (MKT-001..012): campaigns, segments and lists,
 * consent, connector-based sends, lead capture, coupons, promotion
 * linkage, attribution, experiments and analytics.
 */
@Controller('api/v1/marketing')
export class MarketingController {
  constructor(@Inject(MARKETING_SERVICE) private readonly marketing: MarketingService) {}

  @Post('setup')
  @RequirePermission('configuration.publish')
  async setup(@Ctx() ctx: RequestContext) {
    return this.marketing.setup(ctx);
  }

  @Get('campaigns')
  @RequirePermission('crm.read')
  async campaigns(@Ctx() ctx: RequestContext) {
    return { campaigns: await this.marketing.campaigns(ctx) };
  }

  @Get('segments')
  @RequirePermission('crm.read')
  async segments(@Ctx() ctx: RequestContext) {
    return { segments: await this.marketing.segments(ctx) };
  }

  @Post('lists/build')
  @RequirePermission('crm.manage')
  async buildList(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.marketing.buildList(parseBody(buildListSchema, body), ctx);
  }

  @Post('consent')
  @RequirePermission('crm.manage')
  async consent(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.marketing.setConsent(parseBody(consentSchema, body), ctx);
  }

  @Post('campaigns/:code/send')
  @RequirePermission('crm.manage')
  async send(@Param('code') code: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.marketing.send({ campaignCode: code, ...parseBody(sendSchema, body) }, ctx);
  }

  @Get('campaigns/:code/journey')
  @RequirePermission('crm.read')
  async journey(@Param('code') code: string, @Ctx() ctx: RequestContext) {
    return { steps: await this.marketing.journey(code, ctx) };
  }

  @Post('forms/submit')
  @RequirePermission('crm.manage')
  async submitForm(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.marketing.submitForm(parseBody(formSchema, body), ctx);
  }

  @Post('coupons/validate')
  @RequirePermission('crm.read')
  async validateCoupon(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.marketing.validateCoupon(parseBody(couponSchema, body), ctx);
  }

  @Post('campaigns/:code/promotion')
  @RequirePermission('crm.manage')
  async linkPromotion(
    @Param('code') code: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    return this.marketing.linkPromotion(
      { campaignCode: code, ...parseBody(promoSchema, body) },
      ctx,
    );
  }

  @Post('campaigns/:code/attribution')
  @RequirePermission('crm.manage')
  async attribute(@Param('code') code: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.marketing.attributeOrder(
      { campaignCode: code, ...parseBody(attributionSchema, body) },
      ctx,
    );
  }

  @Post('campaigns/:code/variant')
  @RequirePermission('crm.read')
  async variant(@Param('code') code: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.marketing.variant({ campaignCode: code, ...parseBody(variantSchema, body) }, ctx);
  }

  @Get('campaigns/:code/analytics')
  @RequirePermission('crm.read')
  async analytics(@Param('code') code: string, @Ctx() ctx: RequestContext) {
    return this.marketing.analytics(code, ctx);
  }
}

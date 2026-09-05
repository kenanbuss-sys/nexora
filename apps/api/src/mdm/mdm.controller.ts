import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { ConsentService, DataQualityService, PartyService } from '@nexora/domain-mdm';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const PARTY_SERVICE = 'PARTY_SERVICE';
export const DATA_QUALITY_SERVICE = 'DATA_QUALITY_SERVICE';
export const CONSENT_SERVICE = 'CONSENT_SERVICE';

const consentSchema = z.object({
  channel: z.enum(['EMAIL', 'PHONE', 'SMS', 'POST']),
  granted: z.boolean(),
  note: z.string().max(300).optional(),
});
const createPartySchema = z.object({
  partyType: z.enum(['PERSON', 'ORGANIZATION']),
  name: z.string().min(1).max(300),
  email: z.string().email().optional(),
  taxId: z.string().max(50).optional(),
});
const mergeSchema = z.object({
  winnerId: z.string().uuid(),
  loserId: z.string().uuid(),
});
const mapIdentitySchema = z.object({
  partyId: z.string().uuid(),
  sourceSystem: z.string().min(2).max(64),
  externalId: z.string().min(1).max(200),
});

@Controller('api/v1/parties')
export class PartiesController {
  constructor(
    @Inject(PARTY_SERVICE) private readonly parties: PartyService,
    @Inject(DATA_QUALITY_SERVICE) private readonly quality: DataQualityService,
    @Inject(CONSENT_SERVICE) private readonly consents: ConsentService,
  ) {}

  @Get(':id/consents')
  @RequirePermission('mdm.read')
  async listConsents(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.consents.consents(id, ctx);
  }

  @Post(':id/consents')
  @RequirePermission('mdm.steward')
  async recordConsent(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(consentSchema, body);
    return this.consents.record(
      { partyId: id, channel: input.channel, granted: input.granted, note: input.note },
      ctx,
    );
  }

  /** Live data-quality report over master data (MDM stewardship). */
  @Get('quality')
  @RequirePermission('mdm.steward')
  async qualityReport(@Ctx() ctx: RequestContext) {
    return this.quality.report(ctx);
  }

  @Post()
  @RequirePermission('mdm.create')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.parties.createParty(parseBody(createPartySchema, body), ctx);
  }

  @Get('duplicates')
  @RequirePermission('mdm.steward')
  async duplicates(@Ctx() ctx: RequestContext) {
    return { duplicates: await this.parties.findDuplicates(ctx) };
  }

  @Get('resolve/:sourceSystem/:externalId')
  @RequirePermission('mdm.read')
  async resolve(
    @Param('sourceSystem') sourceSystem: string,
    @Param('externalId') externalId: string,
    @Ctx() ctx: RequestContext,
  ) {
    return this.parties.resolveExternalIdentity(sourceSystem, externalId, ctx);
  }

  @Get(':id')
  @RequirePermission('mdm.read')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.parties.getParty(id, ctx);
  }

  @Get()
  @RequirePermission('mdm.read')
  async search(@Ctx() ctx: RequestContext, @Query('q') q?: string) {
    return { parties: await this.parties.searchParties(q ?? '', ctx) };
  }

  @Post('merge')
  @RequirePermission('mdm.merge')
  async merge(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(mergeSchema, body);
    return this.parties.mergeParty(input.winnerId, input.loserId, ctx);
  }

  @Post('external-identities')
  @RequirePermission('mdm.steward')
  async mapIdentity(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.parties.mapExternalIdentity(parseBody(mapIdentitySchema, body), ctx);
  }
}

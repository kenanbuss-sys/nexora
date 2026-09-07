import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type {
  MasterDataApprovalService,
  ConsentService,
  DataQualityService,
  PartyService,
  UomService,
  LocationMasterService,
} from '@nexora/domain-mdm';
import type { FieldPolicyService } from '@nexora/domain-iam';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const PARTY_SERVICE = 'PARTY_SERVICE';
export const DATA_QUALITY_SERVICE = 'DATA_QUALITY_SERVICE';
export const CONSENT_SERVICE = 'CONSENT_SERVICE';
export const MDM_APPROVAL_SERVICE = 'MDM_APPROVAL_SERVICE';
export const UOM_SERVICE = 'UOM_SERVICE';
export const FIELD_POLICY_SERVICE = 'FIELD_POLICY_SERVICE';
export const LOCATION_MASTER_SERVICE = 'LOCATION_MASTER_SERVICE';

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
    @Inject(FIELD_POLICY_SERVICE) private readonly fieldPolicy: FieldPolicyService,
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
  @Get(':id/privacy-export')
  @RequirePermission('mdm.steward')
  async privacyExport(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.parties.privacyExport(id, ctx);
  }

  @Post(':id/anonymize')
  @RequirePermission('mdm.steward')
  async anonymize(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.parties.anonymizeParty(id, ctx);
  }

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
    const view = await this.parties.getParty(id, ctx);
    // IAM-004: field-level permissions redact sensitive fields server-side.
    const hidden = await this.fieldPolicy.hiddenFields('party', ctx);
    return this.fieldPolicy.redact(view as unknown as Record<string, unknown>, hidden);
  }

  @Get()
  @RequirePermission('mdm.read')
  async search(@Ctx() ctx: RequestContext, @Query('q') q?: string) {
    const parties = await this.parties.searchParties(q ?? '', ctx);
    const hidden = await this.fieldPolicy.hiddenFields('party', ctx);
    return {
      parties: parties.map((p) =>
        this.fieldPolicy.redact(p as unknown as Record<string, unknown>, hidden),
      ),
    };
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

const submitChangeSchema = z.object({
  entityType: z.enum(['party', 'product']),
  entityId: z.string().uuid(),
  payload: z.record(z.string(), z.string().min(1).max(300)),
});
const decideChangeSchema = z.object({
  approve: z.boolean(),
  note: z.string().max(500).optional(),
});

@Controller('api/v1/mdm/change-requests')
export class ChangeRequestsController {
  constructor(
    @Inject(MDM_APPROVAL_SERVICE) private readonly approvals: MasterDataApprovalService,
  ) {}

  @Get()
  @RequirePermission('mdm.read')
  async list(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    const parsed = status
      ? parseBody(z.enum(['PENDING', 'APPROVED', 'REJECTED']), status)
      : undefined;
    return { requests: await this.approvals.listRequests(parsed, ctx) };
  }

  @Post()
  @RequirePermission('mdm.create')
  async submit(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.approvals.submitRequest(parseBody(submitChangeSchema, body), ctx);
  }

  @Post(':id/decide')
  @RequirePermission('mdm.steward')
  async decide(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.approvals.decide(id, parseBody(decideChangeSchema, body), ctx);
  }
}

@Controller('api/v1/uoms')
export class UomsController {
  constructor(@Inject(UOM_SERVICE) private readonly uoms: UomService) {}

  @Get()
  @RequirePermission('product.read')
  async list(@Ctx() ctx: RequestContext) {
    return { uoms: await this.uoms.listUoms(ctx) };
  }

  @Get(':code/usage')
  @RequirePermission('mdm.steward')
  async usage(@Param('code') code: string, @Ctx() ctx: RequestContext) {
    return this.uoms.usage(code, ctx);
  }
}

@Controller('api/v1/sites')
export class SitesController {
  constructor(@Inject(LOCATION_MASTER_SERVICE) private readonly locations: LocationMasterService) {}

  @Get()
  @RequirePermission('mdm.read')
  async list(@Ctx() ctx: RequestContext) {
    return { sites: await this.locations.listSites(ctx) };
  }

  @Get('duplicates')
  @RequirePermission('mdm.steward')
  async duplicates(@Ctx() ctx: RequestContext) {
    return { duplicates: await this.locations.duplicateNames(ctx) };
  }
}

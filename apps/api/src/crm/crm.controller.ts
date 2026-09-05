import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { CrmService, Customer360Service, TerritoryService } from '@nexora/domain-crm';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const CRM_SERVICE = 'CRM_SERVICE';
export const CUSTOMER360_SERVICE = 'CUSTOMER360_SERVICE';
export const TERRITORY_SERVICE = 'TERRITORY_SERVICE';

const createAccountSchema = z.object({
  partyId: z.string().uuid(),
  creditLimit: z.number().nonnegative().optional(),
});
const creditProfileSchema = z.object({
  creditLimit: z.number().nonnegative().nullable().optional(),
  creditHold: z.boolean().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).nullable().optional(),
});
const tagsSchema = z.object({ tags: z.array(z.string().min(1).max(30)).max(12) });
const createTerritorySchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(200),
  ownerUserId: z.string().uuid().optional(),
});
const assignTerritorySchema = z.object({ territoryId: z.string().uuid().nullable() });
const createLeadSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  source: z.string().max(100).optional(),
});
const convertLeadSchema = z.object({
  opportunityTitle: z.string().max(200).optional(),
});
const createOpportunitySchema = z.object({
  accountId: z.string().uuid(),
  title: z.string().min(1).max(200),
  amount: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  expectedCloseDate: z.string().datetime().optional(),
});
const moveOpportunitySchema = z.object({
  stage: z.enum(['QUALIFIED', 'PROPOSAL', 'WON', 'LOST']),
});
const logActivitySchema = z.object({
  accountId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  activityType: z.enum(['NOTE', 'CALL', 'MEETING', 'EMAIL', 'TASK']),
  subject: z.string().min(1).max(300),
  body: z.string().max(4000).optional(),
});

@Controller('api/v1/crm/accounts')
export class CrmAccountsController {
  constructor(
    @Inject(CRM_SERVICE) private readonly crm: CrmService,
    @Inject(CUSTOMER360_SERVICE) private readonly customer360: Customer360Service,
    @Inject(TERRITORY_SERVICE) private readonly territories: TerritoryService,
  ) {}

  @Post(':id/territory')
  @RequirePermission('crm.manage')
  async assignTerritory(
    @Param('id') id: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    await this.territories.assignTerritory(
      id,
      parseBody(assignTerritorySchema, body).territoryId,
      ctx,
    );
    return { assigned: true };
  }

  @Get()
  @RequirePermission('crm.read')
  async list(@Ctx() ctx: RequestContext) {
    return { accounts: await this.crm.listAccounts(ctx) };
  }

  @Post()
  @RequirePermission('crm.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.crm.createAccount(parseBody(createAccountSchema, body), ctx);
  }

  @Get(':id')
  @RequirePermission('crm.read')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.crm.getAccount(id, ctx);
  }

  @Get(':id/summary')
  @RequirePermission('crm.read')
  async summary(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.customer360.customer360(id, ctx);
  }

  @Post(':id/credit')
  @RequirePermission('crm.manage')
  async setCredit(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    await this.customer360.setCreditProfile(id, parseBody(creditProfileSchema, body), ctx);
    return { ok: true };
  }

  @Post(':id/tags')
  @RequirePermission('crm.manage')
  async setTags(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    await this.customer360.setTags(id, parseBody(tagsSchema, body).tags, ctx);
    return { ok: true };
  }
}

@Controller('api/v1/crm/leads')
export class CrmLeadsController {
  constructor(@Inject(CRM_SERVICE) private readonly crm: CrmService) {}

  @Get()
  @RequirePermission('crm.read')
  async list(@Ctx() ctx: RequestContext) {
    return { leads: await this.crm.listLeads(ctx) };
  }

  @Post()
  @RequirePermission('crm.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.crm.createLead(parseBody(createLeadSchema, body), ctx);
  }

  @Post(':id/convert')
  @RequirePermission('crm.manage')
  async convert(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.crm.convertLead(id, parseBody(convertLeadSchema, body ?? {}), ctx);
  }

  @Post(':id/disqualify')
  @RequirePermission('crm.manage')
  async disqualify(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    await this.crm.disqualifyLead(id, ctx);
    return { ok: true };
  }
}

@Controller('api/v1/crm/opportunities')
export class CrmOpportunitiesController {
  constructor(@Inject(CRM_SERVICE) private readonly crm: CrmService) {}

  @Get()
  @RequirePermission('crm.read')
  async list(@Ctx() ctx: RequestContext, @Query('accountId') accountId?: string) {
    const params = parseBody(z.object({ accountId: z.string().uuid().optional() }), {
      ...(accountId ? { accountId } : {}),
    });
    return { opportunities: await this.crm.listOpportunities(params, ctx) };
  }

  @Post()
  @RequirePermission('crm.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.crm.createOpportunity(parseBody(createOpportunitySchema, body), ctx);
  }

  @Post(':id/move')
  @RequirePermission('crm.manage')
  async move(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(moveOpportunitySchema, body);
    return this.crm.moveOpportunity(id, input.stage, ctx);
  }
}

@Controller('api/v1/crm/activities')
export class CrmActivitiesController {
  constructor(@Inject(CRM_SERVICE) private readonly crm: CrmService) {}

  @Get()
  @RequirePermission('crm.read')
  async list(
    @Ctx() ctx: RequestContext,
    @Query('accountId') accountId?: string,
    @Query('opportunityId') opportunityId?: string,
  ) {
    const params = parseBody(
      z.object({
        accountId: z.string().uuid().optional(),
        opportunityId: z.string().uuid().optional(),
      }),
      { ...(accountId ? { accountId } : {}), ...(opportunityId ? { opportunityId } : {}) },
    );
    return { activities: await this.crm.listActivities(params, ctx) };
  }

  @Post()
  @RequirePermission('crm.manage')
  async log(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.crm.logActivity(parseBody(logActivitySchema, body), ctx);
  }
}

/** Sales territories (CRM-005). */
@Controller('api/v1/crm/territories')
export class TerritoriesController {
  constructor(@Inject(TERRITORY_SERVICE) private readonly territories: TerritoryService) {}

  @Get()
  @RequirePermission('crm.read')
  async list(@Ctx() ctx: RequestContext) {
    return { territories: await this.territories.listTerritories(ctx) };
  }

  @Post()
  @RequirePermission('crm.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.territories.createTerritory(parseBody(createTerritorySchema, body), ctx);
  }
}

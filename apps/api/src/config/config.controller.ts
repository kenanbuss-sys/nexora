import { Body, Controller, Get, Inject, Param, Post, Put } from '@nestjs/common';
import type { ConfigurationService, CustomObjectService } from '@nexora/domain-core';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const CONFIGURATION_SERVICE = 'CONFIGURATION_SERVICE';
export const CUSTOM_OBJECT_SERVICE = 'CUSTOM_OBJECT_SERVICE';

const terminologySchema = z.object({
  entries: z.record(z.string().min(2).max(100), z.string().min(1).max(200)),
});
const moduleSchema = z.object({ enabled: z.boolean() });
const customFieldSchema = z.object({
  objectType: z.string().min(2).max(64),
  key: z.string().min(2).max(100),
  label: z.string().min(1).max(200),
  fieldType: z.enum(['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT', 'JSON']),
  required: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

@Controller('api/v1/configuration')
export class ConfigController {
  constructor(
    @Inject(CONFIGURATION_SERVICE) private readonly configuration: ConfigurationService,
  ) {}

  @Get('terminology/:locale')
  @RequirePermission('configuration.read')
  async getTerminology(@Param('locale') locale: string, @Ctx() ctx: RequestContext) {
    return { locale, entries: await this.configuration.getTerminology(locale, ctx) };
  }

  @Put('terminology/:locale')
  @RequirePermission('configuration.publish')
  async setTerminology(
    @Param('locale') locale: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(terminologySchema, body);
    return this.configuration.setTerminology(locale, input.entries, ctx);
  }

  @Get('modules')
  @RequirePermission('configuration.read')
  async getModules(@Ctx() ctx: RequestContext) {
    return { modules: await this.configuration.getModuleActivations(ctx) };
  }

  @Put('modules/:moduleKey')
  @RequirePermission('configuration.publish')
  async setModule(
    @Param('moduleKey') moduleKey: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestContext,
  ) {
    const input = parseBody(moduleSchema, body);
    return this.configuration.setModuleActivation(moduleKey, input.enabled, ctx);
  }

  @Get('custom-fields/:objectType')
  @RequirePermission('configuration.read')
  async listCustomFields(@Param('objectType') objectType: string, @Ctx() ctx: RequestContext) {
    return { fields: await this.configuration.listCustomFields(objectType, ctx) };
  }

  @Post('custom-fields')
  @RequirePermission('configuration.publish')
  async defineCustomField(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.configuration.defineCustomField(parseBody(customFieldSchema, body), ctx);
  }
}

const LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

/**
 * Tenant vocabulary for every signed-in user (CORE-004): the terminology
 * dictionary applied at display time, readable without extra permissions
 * (like branding — hidden UI is not authorization, but vocabulary is not
 * a secret either).
 */
@Controller('api/v1/tenant')
export class VocabularyController {
  constructor(
    @Inject(CONFIGURATION_SERVICE) private readonly configuration: ConfigurationService,
  ) {}

  @Get('vocabulary/:locale')
  async vocabulary(@Param('locale') locale: string, @Ctx() ctx: RequestContext) {
    if (!LOCALE_RE.test(locale)) {
      return { entries: {} };
    }
    return { entries: await this.configuration.getTerminology(locale, ctx) };
  }

  /** Module activations for navigation gating (absent key = enabled). */
  @Get('modules')
  async modules(@Ctx() ctx: RequestContext) {
    return { modules: await this.configuration.getModuleActivations(ctx) };
  }
}

const defineObjectSchema = z.object({
  key: z.string().min(2).max(40),
  name: z.string().min(1).max(200),
  fields: z.array(z.record(z.string(), z.unknown())).min(1).max(40),
});
const recordSchema = z.object({ data: z.record(z.string(), z.unknown()) });
const objectStatusSchema = z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'RETIRED']) });

@Controller('api/v1/custom-objects')
export class CustomObjectsController {
  constructor(@Inject(CUSTOM_OBJECT_SERVICE) private readonly objects: CustomObjectService) {}

  @Get()
  @RequirePermission('configuration.read')
  async list(@Ctx() ctx: RequestContext) {
    return { objects: await this.objects.listDefinitions(ctx) };
  }

  @Post()
  @RequirePermission('configuration.publish')
  async define(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.objects.defineObject(parseBody(defineObjectSchema, body), ctx);
  }

  @Post(':key/status')
  @RequirePermission('configuration.publish')
  async setStatus(@Param('key') key: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(objectStatusSchema, body);
    return this.objects.setStatus({ key, status: input.status }, ctx);
  }

  @Get(':key/records')
  @RequirePermission('configuration.read')
  async records(@Param('key') key: string, @Ctx() ctx: RequestContext) {
    return { records: await this.objects.listRecords(key, ctx) };
  }

  @Post(':key/records')
  @RequirePermission('configuration.read')
  async createRecord(@Param('key') key: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(recordSchema, body);
    return this.objects.createRecord({ key, data: input.data }, ctx);
  }
}

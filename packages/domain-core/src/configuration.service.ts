import { writeAudit } from '@nexora/audit';
import type { CustomFieldType, Prisma, PrismaClient } from '@nexora/db';
import { DomainError } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * CORE — terminology dictionary (CORE-004), module activation / feature flags
 * (CORE-006) and the custom-field foundation (CORE-015).
 * All of it is tenant configuration: versionable, auditable, never a fork.
 */

const KEY_RE = /^[a-z][a-z0-9_.-]{1,99}$/;

export interface CustomFieldView {
  objectType: string;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  required: boolean;
  active: boolean;
}

export class ConfigurationService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Bulk upsert of terminology labels for a locale. */
  async setTerminology(
    locale: string,
    entries: Record<string, string>,
    ctx: RequestContext,
  ): Promise<{ updated: number }> {
    const keys = Object.keys(entries);
    if (keys.length === 0 || keys.length > 500) {
      throw new DomainError('VALIDATION_FAILED', 'Provide 1-500 terminology entries');
    }
    for (const key of keys) {
      if (!KEY_RE.test(key)) {
        throw new DomainError('VALIDATION_FAILED', `Invalid terminology key: ${key}`);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [key, label] of Object.entries(entries)) {
        await tx.terminologyEntry.upsert({
          where: { tenantId_locale_key: { tenantId: ctx.tenantId, locale, key } },
          create: { tenantId: ctx.tenantId, locale, key, label },
          update: { label },
        });
      }
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'configuration.terminology.set',
        objectType: 'TerminologyEntry',
        objectId: `${ctx.tenantId}:${locale}`,
        source: 'api',
        newValues: { locale, keys },
      });
    });
    return { updated: keys.length };
  }

  async getTerminology(locale: string, ctx: RequestContext): Promise<Record<string, string>> {
    const entries = await this.prisma.terminologyEntry.findMany({
      where: { tenantId: ctx.tenantId, locale },
    });
    return Object.fromEntries(entries.map((e) => [e.key, e.label]));
  }

  /** Enable/disable a module for the tenant (licensing/flags foundation). */
  async setModuleActivation(
    moduleKey: string,
    enabled: boolean,
    ctx: RequestContext,
  ): Promise<{ moduleKey: string; enabled: boolean }> {
    if (!KEY_RE.test(moduleKey)) {
      throw new DomainError('VALIDATION_FAILED', `Invalid module key: ${moduleKey}`);
    }
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.moduleActivation.findUnique({
        where: { tenantId_moduleKey: { tenantId: ctx.tenantId, moduleKey } },
      });
      await tx.moduleActivation.upsert({
        where: { tenantId_moduleKey: { tenantId: ctx.tenantId, moduleKey } },
        create: { tenantId: ctx.tenantId, moduleKey, enabled },
        update: { enabled },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'configuration.module.set',
        objectType: 'ModuleActivation',
        objectId: `${ctx.tenantId}:${moduleKey}`,
        source: 'api',
        previousValues: { enabled: previous?.enabled ?? false },
        newValues: { enabled },
      });
    });
    return { moduleKey, enabled };
  }

  async getModuleActivations(ctx: RequestContext): Promise<Record<string, boolean>> {
    const modules = await this.prisma.moduleActivation.findMany({
      where: { tenantId: ctx.tenantId },
    });
    return Object.fromEntries(modules.map((m) => [m.moduleKey, m.enabled]));
  }

  /** Define a custom field for an object type (foundation only; no dynamic UI yet). */
  async defineCustomField(
    input: {
      objectType: string;
      key: string;
      label: string;
      fieldType: CustomFieldType;
      required?: boolean | undefined;
      config?: Record<string, unknown> | undefined;
    },
    ctx: RequestContext,
  ): Promise<CustomFieldView> {
    if (!KEY_RE.test(input.key)) {
      throw new DomainError('VALIDATION_FAILED', `Invalid custom field key: ${input.key}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.customFieldDefinition.findUnique({
        where: {
          tenantId_objectType_key: {
            tenantId: ctx.tenantId,
            objectType: input.objectType,
            key: input.key,
          },
        },
      });
      if (existing) {
        throw new DomainError('CONFLICT', 'Custom field already defined for this object type');
      }
      const base = {
        tenantId: ctx.tenantId,
        objectType: input.objectType,
        key: input.key,
        label: input.label,
        fieldType: input.fieldType,
        required: input.required ?? false,
      };
      const field = await tx.customFieldDefinition.create({
        data: input.config ? { ...base, config: input.config as Prisma.InputJsonValue } : base,
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'configuration.custom_field.define',
        objectType: 'CustomFieldDefinition',
        objectId: field.id,
        source: 'api',
        newValues: { objectType: input.objectType, key: input.key, fieldType: input.fieldType },
      });
      return {
        objectType: field.objectType,
        key: field.key,
        label: field.label,
        fieldType: field.fieldType,
        required: field.required,
        active: field.active,
      };
    });
  }

  async listCustomFields(objectType: string, ctx: RequestContext): Promise<CustomFieldView[]> {
    const fields = await this.prisma.customFieldDefinition.findMany({
      where: { tenantId: ctx.tenantId, objectType, active: true },
      orderBy: { key: 'asc' },
    });
    return fields.map((f) => ({
      objectType: f.objectType,
      key: f.key,
      label: f.label,
      fieldType: f.fieldType,
      required: f.required,
      active: f.active,
    }));
  }
}

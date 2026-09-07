import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Custom objects & form builder (CORE-016/017). Tenants define object
 * types as data — field definitions with types and constraints — and
 * records validate server-side against the definition. The definition
 * doubles as the form: the UI renders it, so tenant-specific data
 * capture never forks the codebase.
 */

export type CustomFieldKind = 'text' | 'number' | 'date' | 'boolean' | 'select';

export interface CustomField {
  key: string;
  label: string;
  type: CustomFieldKind;
  required: boolean;
  options?: string[] | undefined;
}

export interface CustomObjectView {
  id: string;
  key: string;
  name: string;
  status: string;
  fields: CustomField[];
  records: number;
}

const KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;
const FIELD_TYPES: ReadonlySet<string> = new Set(['text', 'number', 'date', 'boolean', 'select']);

function parseFields(raw: unknown): CustomField[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) {
    throw new DomainError('VALIDATION_FAILED', 'A definition needs 1-40 fields');
  }
  const seen = new Set<string>();
  const fields: CustomField[] = [];
  for (const entry of raw) {
    const key = (entry as { key?: unknown })?.key;
    const label = (entry as { label?: unknown })?.label;
    const type = (entry as { type?: unknown })?.type;
    const required = (entry as { required?: unknown })?.required;
    const options = (entry as { options?: unknown })?.options;
    if (typeof key !== 'string' || !KEY_RE.test(key) || seen.has(key)) {
      throw new DomainError('VALIDATION_FAILED', `Invalid or duplicate field key '${String(key)}'`);
    }
    if (typeof type !== 'string' || !FIELD_TYPES.has(type)) {
      throw new DomainError('VALIDATION_FAILED', `Unknown field type for '${key}'`);
    }
    if (type === 'select') {
      if (
        !Array.isArray(options) ||
        options.length === 0 ||
        options.some((o) => typeof o !== 'string')
      ) {
        throw new DomainError('VALIDATION_FAILED', `Select field '${key}' needs string options`);
      }
    }
    seen.add(key);
    fields.push({
      key,
      label: typeof label === 'string' && label ? label : key,
      type: type as CustomFieldKind,
      required: required === true,
      ...(type === 'select' ? { options: options as string[] } : {}),
    });
  }
  return fields;
}

function validateRecord(fields: CustomField[], data: Record<string, unknown>): void {
  const known = new Map(fields.map((f) => [f.key, f]));
  for (const key of Object.keys(data)) {
    if (!known.has(key)) {
      throw new DomainError('VALIDATION_FAILED', `Unknown field '${key}'`);
    }
  }
  for (const field of fields) {
    const value = data[field.key];
    if (value === undefined || value === null || value === '') {
      if (field.required) {
        throw new DomainError('VALIDATION_FAILED', `Field '${field.key}' is required`);
      }
      continue;
    }
    switch (field.type) {
      case 'text':
        if (typeof value !== 'string' || value.length > 2000) {
          throw new DomainError('VALIDATION_FAILED', `Field '${field.key}' must be text`);
        }
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new DomainError('VALIDATION_FAILED', `Field '${field.key}' must be a number`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new DomainError('VALIDATION_FAILED', `Field '${field.key}' must be true/false`);
        }
        break;
      case 'date':
        if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
          throw new DomainError('VALIDATION_FAILED', `Field '${field.key}' must be a date`);
        }
        break;
      case 'select':
        if (typeof value !== 'string' || !(field.options ?? []).includes(value)) {
          throw new DomainError(
            'VALIDATION_FAILED',
            `Field '${field.key}' must be one of: ${(field.options ?? []).join(', ')}`,
          );
        }
        break;
    }
  }
}

export class CustomObjectService {
  constructor(private readonly prisma: PrismaClient) {}

  async defineObject(
    input: { key: string; name: string; fields: unknown },
    ctx: RequestContext,
  ): Promise<CustomObjectView> {
    if (!KEY_RE.test(input.key)) {
      throw new DomainError('VALIDATION_FAILED', 'Object key must be snake_case');
    }
    const fields = parseFields(input.fields);
    const existing = await this.prisma.customObjectDefinition.findFirst({
      where: { tenantId: ctx.tenantId, key: input.key },
    });
    if (existing) {
      throw new DomainError('CONFLICT', `Object '${input.key}' already exists`);
    }
    const definition = await this.prisma.customObjectDefinition.create({
      data: {
        tenantId: ctx.tenantId,
        key: input.key,
        name: input.name,
        fields: fields as unknown as Prisma.InputJsonValue,
        ...(ctx.userId !== undefined ? { createdBy: ctx.userId } : {}),
      },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'core.custom_object.define',
      objectType: 'CustomObjectDefinition',
      objectId: definition.id,
      source: 'api',
      newValues: { key: input.key, fields: fields.length },
    });
    return this.toView(definition, 0);
  }

  private toView(
    definition: {
      id: string;
      key: string;
      name: string;
      status: string;
      fields: unknown;
    },
    records: number,
  ): CustomObjectView {
    return {
      id: definition.id,
      key: definition.key,
      name: definition.name,
      status: definition.status,
      fields: definition.fields as unknown as CustomField[],
      records,
    };
  }

  async listDefinitions(ctx: RequestContext): Promise<CustomObjectView[]> {
    const definitions = await this.prisma.customObjectDefinition.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ key: 'asc' }],
      take: 100,
    });
    const counts = await this.prisma.customObjectRecord.groupBy({
      by: ['definitionId'],
      where: { tenantId: ctx.tenantId },
      _count: { id: true },
    });
    const countOf = new Map(counts.map((c) => [c.definitionId, c._count.id]));
    return definitions.map((d) => this.toView(d, countOf.get(d.id) ?? 0));
  }

  async setStatus(
    input: { key: string; status: 'DRAFT' | 'ACTIVE' | 'RETIRED' },
    ctx: RequestContext,
  ): Promise<{ key: string; status: string }> {
    const definition = await this.prisma.customObjectDefinition.findFirst({
      where: { tenantId: ctx.tenantId, key: input.key },
    });
    if (!definition) throw notFound('CustomObjectDefinition', input.key);
    await this.prisma.customObjectDefinition.update({
      where: { id: definition.id },
      data: { status: input.status },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'core.custom_object.status',
      objectType: 'CustomObjectDefinition',
      objectId: definition.id,
      source: 'api',
      previousValues: { status: definition.status },
      newValues: { status: input.status },
    });
    return { key: definition.key, status: input.status };
  }

  async createRecord(
    input: { key: string; data: Record<string, unknown> },
    ctx: RequestContext,
  ): Promise<{ id: string }> {
    const definition = await this.prisma.customObjectDefinition.findFirst({
      where: { tenantId: ctx.tenantId, key: input.key },
    });
    if (!definition) throw notFound('CustomObjectDefinition', input.key);
    if (definition.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', `Object '${input.key}' is not active`);
    }
    validateRecord(definition.fields as unknown as CustomField[], input.data);
    const record = await this.prisma.customObjectRecord.create({
      data: {
        tenantId: ctx.tenantId,
        definitionId: definition.id,
        data: input.data as Prisma.InputJsonValue,
        ...(ctx.userId !== undefined ? { createdBy: ctx.userId } : {}),
      },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'core.custom_object.record',
      objectType: 'CustomObjectRecord',
      objectId: record.id,
      source: 'api',
      newValues: { key: input.key },
    });
    return { id: record.id };
  }

  async listRecords(
    key: string,
    ctx: RequestContext,
  ): Promise<Array<{ id: string; data: unknown; createdAt: string }>> {
    const definition = await this.prisma.customObjectDefinition.findFirst({
      where: { tenantId: ctx.tenantId, key },
    });
    if (!definition) throw notFound('CustomObjectDefinition', key);
    const records = await this.prisma.customObjectRecord.findMany({
      where: { tenantId: ctx.tenantId, definitionId: definition.id },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return records.map((r) => ({
      id: r.id,
      data: r.data,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

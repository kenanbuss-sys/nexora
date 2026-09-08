import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Conditional forms & validation rules (WF-006/007). Forms are tenant
 * configuration (`wf.forms`), never code: fields carry type,
 * requiredness, pattern/range validation and a `showIf` condition
 * over the submitted data. Hidden fields are neither required nor
 * accepted; every submission is validated server-side and audited.
 */

export interface FormFieldSpec {
  key: string;
  label: string;
  type: 'text' | 'number' | 'choice' | 'boolean';
  required: boolean;
  pattern?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  choices?: string[] | undefined;
  showIf?: { field: string; op: 'eq' | 'ne' | 'exists'; value?: unknown } | undefined;
}

export interface FormSpec {
  key: string;
  title: string;
  fields: FormFieldSpec[];
}

const KEY_RE = /^[a-z][a-z0-9_-]{1,40}$/;

function parseForms(config: unknown): FormSpec[] {
  const wf = ((config as Record<string, unknown>).wf ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(wf.forms) ? wf.forms : [];
  const forms: FormSpec[] = [];
  for (const entry of raw) {
    const f = entry as Record<string, unknown>;
    if (typeof f.key !== 'string' || !KEY_RE.test(f.key) || !Array.isArray(f.fields)) continue;
    const fields: FormFieldSpec[] = [];
    for (const rawField of f.fields as Array<Record<string, unknown>>) {
      if (typeof rawField.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(rawField.key)) {
        continue;
      }
      const type = rawField.type;
      if (type !== 'text' && type !== 'number' && type !== 'choice' && type !== 'boolean') {
        continue;
      }
      const showIfRaw = rawField.showIf as Record<string, unknown> | undefined;
      fields.push({
        key: rawField.key,
        label: typeof rawField.label === 'string' ? rawField.label : rawField.key,
        type,
        required: rawField.required === true,
        pattern: typeof rawField.pattern === 'string' ? rawField.pattern : undefined,
        min: Number.isFinite(Number(rawField.min)) ? Number(rawField.min) : undefined,
        max: Number.isFinite(Number(rawField.max)) ? Number(rawField.max) : undefined,
        choices: Array.isArray(rawField.choices)
          ? (rawField.choices as unknown[]).map(String)
          : undefined,
        showIf:
          showIfRaw &&
          typeof showIfRaw.field === 'string' &&
          (showIfRaw.op === 'eq' || showIfRaw.op === 'ne' || showIfRaw.op === 'exists')
            ? { field: showIfRaw.field, op: showIfRaw.op, value: showIfRaw.value }
            : undefined,
      });
    }
    forms.push({
      key: f.key,
      title: typeof f.title === 'string' ? f.title : f.key,
      fields,
    });
  }
  return forms;
}

function isVisible(field: FormFieldSpec, data: Record<string, unknown>): boolean {
  if (!field.showIf) return true;
  const actual = data[field.showIf.field];
  if (field.showIf.op === 'exists') return actual !== undefined && actual !== null;
  if (field.showIf.op === 'eq') return actual === field.showIf.value;
  return actual !== field.showIf.value;
}

export class FormService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration: {
      getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
    },
  ) {}

  async listForms(ctx: RequestContext): Promise<Array<{ key: string; title: string }>> {
    const { config } = await this.configuration.getEffectiveConfiguration(ctx.tenantId);
    return parseForms(config).map((f) => ({ key: f.key, title: f.title }));
  }

  /** The effective form: hidden fields filtered by current data. */
  async getForm(
    key: string,
    data: Record<string, unknown>,
    ctx: RequestContext,
  ): Promise<{ key: string; title: string; fields: FormFieldSpec[] }> {
    const { config } = await this.configuration.getEffectiveConfiguration(ctx.tenantId);
    const form = parseForms(config).find((f) => f.key === key);
    if (!form) throw notFound('Form', key);
    return { ...form, fields: form.fields.filter((f) => isVisible(f, data)) };
  }

  /**
   * Server-side validation (WF-007): required/pattern/range/choice
   * rules apply to visible fields; hidden and unknown fields are
   * rejected. Valid submissions are audited with the normalized data.
   */
  async submitForm(
    key: string,
    data: Record<string, unknown>,
    ctx: RequestContext,
  ): Promise<{ ok: true; data: Record<string, unknown> }> {
    const { config } = await this.configuration.getEffectiveConfiguration(ctx.tenantId);
    const form = parseForms(config).find((f) => f.key === key);
    if (!form) throw notFound('Form', key);
    const violations: Record<string, string> = {};
    const visible = form.fields.filter((f) => isVisible(f, data));
    const visibleKeys = new Set(visible.map((f) => f.key));
    for (const dataKey of Object.keys(data)) {
      if (!visibleKeys.has(dataKey)) violations[dataKey] = 'Field is not part of this form';
    }
    const normalized: Record<string, unknown> = {};
    for (const field of visible) {
      const value = data[field.key];
      if (value === undefined || value === null || value === '') {
        if (field.required) violations[field.key] = 'Required';
        continue;
      }
      if (field.type === 'number') {
        const num = Number(value);
        if (!Number.isFinite(num)) {
          violations[field.key] = 'Must be a number';
          continue;
        }
        if (field.min !== undefined && num < field.min) violations[field.key] = `Min ${field.min}`;
        if (field.max !== undefined && num > field.max) violations[field.key] = `Max ${field.max}`;
        normalized[field.key] = num;
      } else if (field.type === 'boolean') {
        if (typeof value !== 'boolean') {
          violations[field.key] = 'Must be true or false';
          continue;
        }
        normalized[field.key] = value;
      } else if (field.type === 'choice') {
        if (!field.choices?.includes(String(value))) {
          violations[field.key] = 'Not an allowed choice';
          continue;
        }
        normalized[field.key] = String(value);
      } else {
        const text = String(value);
        if (field.pattern) {
          try {
            if (!new RegExp(field.pattern).test(text)) {
              violations[field.key] = 'Does not match the required format';
              continue;
            }
          } catch {
            // A broken configured pattern never blocks submissions.
          }
        }
        if (field.max !== undefined && text.length > field.max) {
          violations[field.key] = `Max length ${field.max}`;
          continue;
        }
        normalized[field.key] = text;
      }
    }
    if (Object.keys(violations).length > 0) {
      throw new DomainError('VALIDATION_FAILED', 'Form validation failed', {
        fieldErrors: violations,
      });
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'wf.form.submit',
      objectType: 'Form',
      objectId: key,
      source: 'api',
      newValues: { data: normalized as never },
    });
    return { ok: true, data: normalized };
  }
}

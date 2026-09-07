import type { RequestContext } from '@nexora/tenancy';

/**
 * Field-level permissions (IAM-004). Sensitive fields are declared in
 * versioned configuration (iam.fieldPermissions: [{ objectType, field,
 * permission }]): a caller who lacks the named permission gets the
 * field redacted server-side — hidden UI is not authorization, so the
 * value never leaves the API.
 */

export const REDACTED = '•••';

/** Cross-domain contract: effective configuration is owned by CORE. */
export interface FieldPolicyConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ version: number; config: unknown }>;
}

/** Same-domain collaborator: effective permissions per user. */
export interface PermissionLookupGate {
  getPermissionKeys(userId: string, tenantId: string): Promise<string[]>;
}

export class FieldPolicyService {
  constructor(
    private readonly config: FieldPolicyConfigGate,
    private readonly permissions: PermissionLookupGate,
  ) {}

  private async rules(
    tenantId: string,
  ): Promise<Array<{ objectType: string; field: string; permission: string }>> {
    try {
      const { config } = await this.config.getEffectiveConfiguration(tenantId);
      const raw = (config as { iam?: { fieldPermissions?: unknown } })?.iam?.fieldPermissions;
      if (!Array.isArray(raw)) return [];
      const out: Array<{ objectType: string; field: string; permission: string }> = [];
      for (const entry of raw) {
        const objectType = (entry as { objectType?: unknown })?.objectType;
        const field = (entry as { field?: unknown })?.field;
        const permission = (entry as { permission?: unknown })?.permission;
        if (
          typeof objectType === 'string' &&
          typeof field === 'string' &&
          typeof permission === 'string'
        ) {
          out.push({ objectType, field, permission });
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  /** Field names the current caller may NOT see for this object type. */
  async hiddenFields(objectType: string, ctx: RequestContext): Promise<Set<string>> {
    if (ctx.platformAdmin === true) return new Set();
    const rules = (await this.rules(ctx.tenantId)).filter((r) => r.objectType === objectType);
    if (rules.length === 0) return new Set();
    const keys =
      ctx.userId !== undefined
        ? await this.permissions.getPermissionKeys(ctx.userId, ctx.tenantId)
        : [];
    const granted = new Set(keys);
    return new Set(rules.filter((r) => !granted.has(r.permission)).map((r) => r.field));
  }

  /** Redact the named fields on a plain view object (non-mutating). */
  redact<T extends Record<string, unknown>>(view: T, hidden: Set<string>): T {
    if (hidden.size === 0) return view;
    const copy: Record<string, unknown> = { ...view };
    for (const field of hidden) {
      if (field in copy && copy[field] !== null && copy[field] !== undefined) {
        copy[field] = REDACTED;
      }
    }
    return copy as T;
  }
}

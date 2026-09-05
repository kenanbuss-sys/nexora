import { createHash, randomBytes } from 'node:crypto';
import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Service accounts (IAM-009) and the security event log (IAM-013).
 *
 * API keys carry an explicit permission allowlist, are stored only as
 * SHA-256 hashes and are revocable; every use, denial and revocation
 * lands in the append-only security log.
 */

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface SecurityEventView {
  id: string;
  eventType: string;
  subject: string | null;
  detail: string | null;
  createdAt: string;
}

export interface ResolvedApiKey {
  tenantId: string;
  apiKeyId: string;
  name: string;
  permissions: string[];
}

const KEY_PATTERN = /^nxk_[a-f0-9]{48}$/;

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export class ServiceAccountService {
  constructor(private readonly prisma: PrismaClient) {}

  async listKeys(ctx: RequestContext): Promise<ApiKeyView[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      permissions: k.permissions,
      active: k.active,
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      createdAt: k.createdAt.toISOString(),
    }));
  }

  /** Creates a key; the full secret is returned exactly once. */
  async createKey(
    input: { name: string; permissions: string[] },
    ctx: RequestContext,
  ): Promise<ApiKeyView & { key: string }> {
    if (input.permissions.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Grant at least one permission');
    }
    const key = `nxk_${randomBytes(24).toString('hex')}`;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.apiKey.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            prefix: key.slice(0, 9),
            keyHash: hashKey(key),
            permissions: [...new Set(input.permissions)],
            createdBy: ctx.userId ?? null,
          },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'iam.api_key.create',
          objectType: 'ApiKey',
          objectId: row.id,
          source: 'api',
          newValues: { name: input.name, permissions: input.permissions },
        });
        await tx.securityEvent.create({
          data: {
            tenantId: ctx.tenantId,
            eventType: 'api_key.created',
            subject: ctx.userId ?? null,
            detail: `key '${input.name}' (${key.slice(0, 9)}…)`,
          },
        });
        return row;
      });
      return {
        id: created.id,
        name: created.name,
        prefix: created.prefix,
        permissions: created.permissions,
        active: created.active,
        lastUsedAt: null,
        createdAt: created.createdAt.toISOString(),
        key,
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', `API key '${input.name}' already exists`);
      }
      throw error;
    }
  }

  async revokeKey(apiKeyId: string, ctx: RequestContext): Promise<void> {
    const updated = await this.prisma.apiKey.updateMany({
      where: { id: apiKeyId, tenantId: ctx.tenantId },
      data: { active: false },
    });
    if (updated.count === 0) throw notFound('ApiKey', apiKeyId);
    await this.logSecurityEvent(ctx.tenantId, 'api_key.revoked', ctx.userId ?? null, apiKeyId);
  }

  /** AuthGuard hook: resolves a presented key, or null. Uses hash lookup. */
  async resolveKey(presentedKey: string): Promise<ResolvedApiKey | null> {
    if (!KEY_PATTERN.test(presentedKey)) return null;
    const row = await this.prisma.apiKey.findFirst({
      where: { keyHash: hashKey(presentedKey), active: true },
    });
    if (!row) return null;
    await this.prisma.apiKey.updateMany({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      tenantId: row.tenantId,
      apiKeyId: row.id,
      name: row.name,
      permissions: row.permissions,
    };
  }

  // --------------------------------------------------------- security events

  async logSecurityEvent(
    tenantId: string | null,
    eventType: string,
    subject: string | null,
    detail: string | null,
  ): Promise<void> {
    await this.prisma.securityEvent.create({
      data: { tenantId, eventType, subject, detail },
    });
  }

  async listSecurityEvents(ctx: RequestContext): Promise<SecurityEventView[]> {
    const events = await this.prisma.securityEvent.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      subject: e.subject,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}

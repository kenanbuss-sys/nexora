import { writeAudit } from '@nexora/audit';
import type { PartyType, Prisma, PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * MDM — canonical parties (MDM-*): creation, duplicate detection, merge with
 * preserved redirects, governed external identity mapping.
 * Role-specific commercial profiles (customer/supplier) belong to CRM/PROC.
 */

export interface PartyView {
  id: string;
  partyType: PartyType;
  name: string;
  email: string | null;
  taxId: string | null;
  status: 'ACTIVE' | 'MERGED';
  mergedIntoId: string | null;
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toView(p: {
  id: string;
  partyType: PartyType;
  name: string;
  email: string | null;
  taxId: string | null;
  status: 'ACTIVE' | 'MERGED';
  mergedIntoId: string | null;
}): PartyView {
  return {
    id: p.id,
    partyType: p.partyType,
    name: p.name,
    email: p.email,
    taxId: p.taxId,
    status: p.status,
    mergedIntoId: p.mergedIntoId,
  };
}

export class PartyService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Permission: mdm.create. Emits party.created. */
  async createParty(
    input: {
      partyType: PartyType;
      name: string;
      email?: string | undefined;
      taxId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<PartyView> {
    const name = input.name.trim();
    if (name.length === 0) throw new DomainError('VALIDATION_FAILED', 'Party name is required');
    return this.prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: {
          tenantId: ctx.tenantId,
          partyType: input.partyType,
          name,
          normalizedName: normalizeName(name),
          email: input.email?.trim().toLowerCase() ?? null,
          taxId: input.taxId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'party.create',
        objectType: 'Party',
        objectId: party.id,
        source: 'api',
        newValues: { name, partyType: input.partyType },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.PARTY_CREATED,
        aggregateType: 'Party',
        aggregateId: party.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { partyId: party.id },
      });
      return toView(party);
    });
  }

  /** Resolves merge redirects: always returns the surviving canonical party. */
  async getParty(partyId: string, ctx: RequestContext): Promise<PartyView> {
    const initial = await this.prisma.party.findFirst({
      where: { id: partyId, tenantId: ctx.tenantId },
    });
    if (!initial) throw notFound('Party', partyId);
    let current = initial;
    let hops = 0;
    while (current.status === 'MERGED' && current.mergedIntoId && hops < 10) {
      const next = await this.prisma.party.findFirst({
        where: { id: current.mergedIntoId, tenantId: ctx.tenantId },
      });
      if (!next) break;
      current = next;
      hops += 1;
    }
    return toView(current);
  }

  /**
   * Governed update (MDM-006): applied ONLY through the master data
   * approval flow; the audit trail carries before/after values.
   */
  async applyGovernedUpdate(
    partyId: string,
    changes: { name?: string | undefined; email?: string | undefined },
    ctx: RequestContext,
  ): Promise<void> {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, tenantId: ctx.tenantId },
    });
    if (!party) throw notFound('Party', partyId);
    const data: Record<string, unknown> = {};
    if (changes.name !== undefined) {
      data.name = changes.name.trim();
      data.normalizedName = normalizeName(changes.name);
    }
    if (changes.email !== undefined) data.email = changes.email.trim();
    if (Object.keys(data).length === 0) return;
    await this.prisma.party.update({ where: { id: party.id }, data });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'mdm.party.governed_update',
      objectType: 'Party',
      objectId: party.id,
      source: 'api',
      previousValues: { name: party.name, email: party.email },
      newValues: data as Prisma.InputJsonValue,
    });
  }

  /**
   * GDPR data-subject export (GRC-012): everything MDM holds about one
   * person, audited. Server-side authorization decides who may pull it.
   */
  async privacyExport(
    partyId: string,
    ctx: RequestContext,
  ): Promise<{
    party: PartyView;
    externalIdentities: Array<{ system: string; externalId: string }>;
    consents: Array<{ channel: string; granted: boolean; recordedAt: string }>;
  }> {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, tenantId: ctx.tenantId },
    });
    if (!party) throw notFound('Party', partyId);
    const identities = await this.prisma.partyExternalIdentity.findMany({
      where: { tenantId: ctx.tenantId, partyId },
    });
    const consents = await this.prisma.consentRecord.findMany({
      where: { tenantId: ctx.tenantId, partyId },
      orderBy: { recordedAt: 'desc' },
      take: 200,
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'mdm.party.privacy_export',
      objectType: 'Party',
      objectId: partyId,
      source: 'api',
    });
    return {
      party: toView(party),
      externalIdentities: identities.map((i) => ({
        system: i.sourceSystem,
        externalId: i.externalId,
      })),
      consents: consents.map((c) => ({
        channel: c.channel,
        granted: c.granted,
        recordedAt: c.recordedAt.toISOString(),
      })),
    };
  }

  /**
   * GDPR erasure (GRC-012): anonymize a PERSON party in place — the
   * business records keep their referential integrity while the
   * personal data disappears. Compensation-style, irreversible,
   * heavily audited. Organizations are not data subjects and are
   * refused.
   */
  async anonymizeParty(partyId: string, ctx: RequestContext): Promise<PartyView> {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, tenantId: ctx.tenantId },
    });
    if (!party) throw notFound('Party', partyId);
    if (party.partyType !== 'PERSON') {
      throw new DomainError('INVALID_STATE', 'Only PERSON parties are GDPR data subjects');
    }
    if (party.name.startsWith('ANONYMIZED-')) {
      throw new DomainError('INVALID_STATE', 'Party is already anonymized');
    }
    const anonName = `ANONYMIZED-${party.id.slice(0, 8)}`;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.party.update({
        where: { id: party.id },
        data: {
          name: anonName,
          normalizedName: normalizeName(anonName),
          email: null,
          taxId: null,
        },
      });
      await tx.partyExternalIdentity.deleteMany({
        where: { tenantId: ctx.tenantId, partyId: party.id },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'mdm.party.anonymize',
        objectType: 'Party',
        objectId: party.id,
        source: 'api',
        newValues: { anonymized: true },
      });
      return row;
    });
    return toView(updated);
  }

  async searchParties(query: string, ctx: RequestContext): Promise<PartyView[]> {
    const parties = await this.prisma.party.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'ACTIVE',
        normalizedName: { contains: normalizeName(query) },
      },
      orderBy: { name: 'asc' },
      take: 50,
    });
    return parties.map(toView);
  }

  /** Duplicate candidates by identical normalized name (steward queue input). */
  async findDuplicates(ctx: RequestContext): Promise<Array<{ name: string; partyIds: string[] }>> {
    const groups = await this.prisma.party.groupBy({
      by: ['normalizedName'],
      where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
      having: { normalizedName: { _count: { gt: 1 } } },
      _count: true,
    });
    const result: Array<{ name: string; partyIds: string[] }> = [];
    for (const group of groups) {
      const parties = await this.prisma.party.findMany({
        where: { tenantId: ctx.tenantId, status: 'ACTIVE', normalizedName: group.normalizedName },
        select: { id: true },
      });
      result.push({ name: group.normalizedName, partyIds: parties.map((p) => p.id) });
    }
    return result;
  }

  /**
   * Merge loser into winner. The loser becomes MERGED with a preserved
   * redirect; external identities move to the winner. Permission: mdm.merge.
   */
  async mergeParty(winnerId: string, loserId: string, ctx: RequestContext): Promise<PartyView> {
    if (winnerId === loserId) {
      throw new DomainError('VALIDATION_FAILED', 'Cannot merge a party into itself');
    }
    return this.prisma.$transaction(async (tx) => {
      const winner = await tx.party.findFirst({
        where: { id: winnerId, tenantId: ctx.tenantId, status: 'ACTIVE' },
      });
      if (!winner) throw notFound('Party', winnerId);
      const loser = await tx.party.findFirst({
        where: { id: loserId, tenantId: ctx.tenantId, status: 'ACTIVE' },
      });
      if (!loser) throw notFound('Party', loserId);

      await tx.party.update({
        where: { id: loser.id },
        data: { status: 'MERGED', mergedIntoId: winner.id },
      });
      await tx.partyExternalIdentity.updateMany({
        where: { partyId: loser.id },
        data: { partyId: winner.id },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'party.merge',
        objectType: 'Party',
        objectId: loser.id,
        source: 'api',
        previousValues: { status: 'ACTIVE' },
        newValues: { status: 'MERGED', mergedIntoId: winner.id },
      });
      return toView(winner);
    });
  }

  /** Governed external mapping, unique per (source, externalId). Permission: mdm.steward. */
  async mapExternalIdentity(
    input: { partyId: string; sourceSystem: string; externalId: string },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    return this.prisma.$transaction(async (tx) => {
      const party = await tx.party.findFirst({
        where: { id: input.partyId, tenantId: ctx.tenantId },
      });
      if (!party) throw notFound('Party', input.partyId);
      const existing = await tx.partyExternalIdentity.findUnique({
        where: {
          tenantId_sourceSystem_externalId: {
            tenantId: ctx.tenantId,
            sourceSystem: input.sourceSystem,
            externalId: input.externalId,
          },
        },
      });
      if (existing) {
        throw new DomainError('CONFLICT', 'This external identity is already mapped', {
          sourceSystem: input.sourceSystem,
          externalId: input.externalId,
        });
      }
      await tx.partyExternalIdentity.create({
        data: {
          tenantId: ctx.tenantId,
          partyId: party.id,
          sourceSystem: input.sourceSystem,
          externalId: input.externalId,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'party.external_identity.map',
        objectType: 'Party',
        objectId: party.id,
        source: 'api',
        newValues: { sourceSystem: input.sourceSystem, externalId: input.externalId },
      });
      return { ok: true as const };
    });
  }

  /** Resolve an external id to the canonical (post-merge) party. */
  async resolveExternalIdentity(
    sourceSystem: string,
    externalId: string,
    ctx: RequestContext,
  ): Promise<PartyView> {
    const mapping = await this.prisma.partyExternalIdentity.findUnique({
      where: {
        tenantId_sourceSystem_externalId: { tenantId: ctx.tenantId, sourceSystem, externalId },
      },
    });
    if (!mapping) throw notFound('ExternalIdentity', `${sourceSystem}:${externalId}`);
    return this.getParty(mapping.partyId, ctx);
  }
}

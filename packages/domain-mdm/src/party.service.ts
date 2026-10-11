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

export type DuplicateReason = 'NAME' | 'TAX_ID' | 'EMAIL';

export interface DuplicateCandidateGroup {
  reason: DuplicateReason;
  key: string;
  parties: PartyView[];
}

/** Golden-record fields a steward may take over from the merged duplicate. */
export type MergeField = 'name' | 'email' | 'taxId';
export const MERGE_FIELDS: MergeField[] = ['name', 'email', 'taxId'];

export interface MergePreview {
  winner: PartyView;
  loser: PartyView;
  differences: Array<{ field: MergeField; winner: string | null; loser: string | null }>;
  moves: { externalIdentities: number; redirects: number };
  stays: { consents: number };
  blockers: string[];
}

function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function pick(
  p: { name: string; email: string | null; taxId: string | null },
  fields: MergeField[],
): Record<string, string | null> {
  return Object.fromEntries(fields.map((f) => [f, p[f]]));
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
   * Duplicate candidates (MDM-005) with match reasons, computed in SQL so
   * the normalisation has one definition:
   * - NAME: lower-cased name without punctuation and legal-form suffixes
   *   (d.o.o., d.d., s.p., ltd, gmbh, ...);
   * - TAX_ID: tax/registration number without separators;
   * - EMAIL: lower-cased e-mail.
   * Groups whose every pair a steward dismissed are hidden.
   */
  async duplicateCandidates(ctx: RequestContext): Promise<DuplicateCandidateGroup[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ reason: DuplicateReason; key: string; ids: string[] }>
    >`
      WITH p AS (
        SELECT id, name, email, tax_id,
          btrim(regexp_replace(regexp_replace(
            regexp_replace(lower(name), '[^[:alnum:]]+', ' ', 'g'),
            '(^| )(d o o|doo|d d|dd|s p|sp|j d o o|ad|a d|ltd|llc|inc|gmbh|ag|sa|srl|spa|bv|plc)( |$)',
            ' ', 'g'), ' +', ' ', 'g')) AS name_key,
          upper(regexp_replace(coalesce(tax_id, ''), '[^[:alnum:]]', '', 'g')) AS tax_key,
          lower(btrim(coalesce(email, ''))) AS email_key
        FROM party
        WHERE tenant_id = ${ctx.tenantId}::uuid AND status = 'ACTIVE'
      )
      , g AS (
        SELECT 'NAME' AS reason, name_key AS key, array_agg(id ORDER BY id) AS ids
          FROM p WHERE name_key <> '' GROUP BY name_key HAVING count(*) > 1
        UNION ALL
        SELECT 'TAX_ID', tax_key, array_agg(id ORDER BY id)
          FROM p WHERE length(tax_key) >= 4 GROUP BY tax_key HAVING count(*) > 1
        UNION ALL
        SELECT 'EMAIL', email_key, array_agg(id ORDER BY id)
          FROM p WHERE email_key <> '' GROUP BY email_key HAVING count(*) > 1
      )
      -- A group stays open while at least one pair is not dismissed; the
      -- filter runs BEFORE the limit so dismissed groups never crowd out
      -- new candidates.
      SELECT g.reason, g.key, array(SELECT x::text FROM unnest(g.ids) x) AS ids
        FROM g
       WHERE EXISTS (
         SELECT 1 FROM unnest(g.ids) a, unnest(g.ids) b
          WHERE a < b AND NOT EXISTS (
            SELECT 1 FROM mdm_duplicate_dismissal d
             WHERE d.tenant_id = ${ctx.tenantId}::uuid AND d.entity_type = 'party'
               AND d.a_id = a AND d.b_id = b))
       ORDER BY 1, 2
       LIMIT 300
    `;
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.flatMap((r) => r.ids))];
    const parties = await this.prisma.party.findMany({
      where: { tenantId: ctx.tenantId, id: { in: ids } },
    });
    const byId = new Map(parties.map((p) => [p.id, p]));
    const groups: DuplicateCandidateGroup[] = [];
    for (const row of rows) {
      groups.push({
        reason: row.reason,
        key: row.key,
        parties: row.ids
          .map((id) => byId.get(id))
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => toView(p)),
      });
    }
    return groups;
  }

  /** Permission: mdm.steward. Records "not a duplicate" for a pair (audited, idempotent). */
  async dismissDuplicate(
    input: { partyAId: string; partyBId: string; note?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    if (!ctx.userId) {
      throw new DomainError('FORBIDDEN', 'A user session is required for steward decisions');
    }
    if (input.partyAId === input.partyBId) {
      throw new DomainError('VALIDATION_FAILED', 'A pair needs two different parties');
    }
    const [aId, bId] = orderPair(input.partyAId.toLowerCase(), input.partyBId.toLowerCase());
    const found = await this.prisma.party.count({
      where: { tenantId: ctx.tenantId, id: { in: [aId, bId] } },
    });
    if (found !== 2) throw notFound('Party', `${aId},${bId}`);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.mdmDuplicateDismissal.findUnique({
          where: {
            tenantId_entityType_aId_bId: { tenantId: ctx.tenantId, entityType: 'party', aId, bId },
          },
        });
        if (existing) return { ok: true as const, duplicate: true };
        const created = await tx.mdmDuplicateDismissal.create({
          data: {
            tenantId: ctx.tenantId,
            entityType: 'party',
            aId,
            bId,
            note: input.note?.trim() || null,
            dismissedBy: ctx.userId!,
          },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'mdm.duplicate.dismiss',
          objectType: 'MdmDuplicateDismissal',
          objectId: created.id,
          source: 'api',
          newValues: { aId, bId },
        });
        return { ok: true as const, duplicate: false };
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return { ok: true, duplicate: true };
      throw error;
    }
  }

  /**
   * Permission: mdm.read. What a merge would do: both records, the fields
   * that differ, and the MDM-owned references that move to the winner.
   */
  async mergePreview(
    winnerId: string,
    loserId: string,
    ctx: RequestContext,
  ): Promise<MergePreview> {
    if (winnerId === loserId) {
      throw new DomainError('VALIDATION_FAILED', 'Cannot merge a party into itself');
    }
    const [winner, loser] = await Promise.all([
      this.prisma.party.findFirst({ where: { id: winnerId, tenantId: ctx.tenantId } }),
      this.prisma.party.findFirst({ where: { id: loserId, tenantId: ctx.tenantId } }),
    ]);
    if (!winner) throw notFound('Party', winnerId);
    if (!loser) throw notFound('Party', loserId);
    const [externalIdentities, redirects, consents] = await Promise.all([
      this.prisma.partyExternalIdentity.count({
        where: { tenantId: ctx.tenantId, partyId: loser.id },
      }),
      this.prisma.party.count({ where: { tenantId: ctx.tenantId, mergedIntoId: loser.id } }),
      this.prisma.consentRecord.count({ where: { tenantId: ctx.tenantId, partyId: loser.id } }),
    ]);
    const blockers: string[] = [];
    if (winner.status !== 'ACTIVE') blockers.push('The surviving party is not active');
    if (loser.status !== 'ACTIVE') blockers.push('The duplicate is already merged');
    if (winner.partyType !== loser.partyType) {
      blockers.push('A person cannot be merged with an organisation');
    }
    const differences = MERGE_FIELDS.filter((f) => (winner[f] ?? null) !== (loser[f] ?? null)).map(
      (f) => ({ field: f, winner: winner[f] ?? null, loser: loser[f] ?? null }),
    );
    return {
      winner: toView(winner),
      loser: toView(loser),
      differences,
      moves: { externalIdentities, redirects },
      stays: { consents },
      blockers,
    };
  }

  /**
   * Merge loser into winner (MDM-005). Permission: mdm.merge.
   * - both rows locked (sorted order) so concurrent merges cannot form a
   *   cycle or merge one record twice;
   * - replay of the same merge is a no-op (`duplicate: true`);
   * - survivorship: `takeFromLoser` copies chosen fields onto the winner;
   * - earlier redirects into the loser are re-pointed to the winner (no
   *   chains), external identities move, consent history stays with the
   *   loser record (legal evidence), `party.merged` goes to the outbox.
   */
  async mergeParty(
    winnerId: string,
    loserId: string,
    ctx: RequestContext,
    options: { takeFromLoser?: MergeField[] | undefined } = {},
  ): Promise<PartyView & { duplicate: boolean }> {
    // Postgres returns ids in lower case; compare like with like.
    winnerId = winnerId.toLowerCase();
    loserId = loserId.toLowerCase();
    if (winnerId === loserId) {
      throw new DomainError('VALIDATION_FAILED', 'Cannot merge a party into itself');
    }
    const take = [...new Set(options.takeFromLoser ?? [])];
    for (const field of take) {
      if (!MERGE_FIELDS.includes(field)) {
        throw new DomainError('VALIDATION_FAILED', `Field ${String(field)} cannot be taken over`);
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const [first, second] = orderPair(winnerId, loserId);
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id FROM party
        WHERE tenant_id = ${ctx.tenantId}::uuid AND id IN (${first}::uuid, ${second}::uuid)
        ORDER BY id FOR UPDATE`;
      if (!locked.some((r) => r.id === winnerId)) throw notFound('Party', winnerId);
      if (!locked.some((r) => r.id === loserId)) throw notFound('Party', loserId);
      const winner = (await tx.party.findFirst({
        where: { id: winnerId, tenantId: ctx.tenantId },
      }))!;
      const loser = (await tx.party.findFirst({ where: { id: loserId, tenantId: ctx.tenantId } }))!;

      if (loser.status === 'MERGED' && loser.mergedIntoId === winner.id) {
        return { ...toView(winner), duplicate: true };
      }
      if (winner.status !== 'ACTIVE') {
        throw new DomainError('INVALID_STATE', 'The surviving party is not active');
      }
      if (loser.status !== 'ACTIVE') {
        throw new DomainError('INVALID_STATE', 'This party is already merged into another one');
      }
      if (winner.partyType !== loser.partyType) {
        throw new DomainError('INVALID_STATE', 'A person cannot be merged with an organisation');
      }

      const winnerChanges: Record<string, string | null> = {};
      for (const field of take) {
        // An empty value on the duplicate never wipes the survivor's value.
        const value = loser[field];
        if (value !== null && value.trim() !== '' && value !== winner[field]) {
          winnerChanges[field] = value;
        }
      }
      let survivor = winner;
      if (Object.keys(winnerChanges).length > 0) {
        survivor = await tx.party.update({
          where: { id: winner.id },
          data: {
            ...winnerChanges,
            ...(winnerChanges.name ? { normalizedName: normalizeName(winnerChanges.name) } : {}),
          },
        });
      }
      await tx.party.update({
        where: { id: loser.id },
        data: { status: 'MERGED', mergedIntoId: winner.id },
      });
      const redirected = await tx.party.updateMany({
        where: { tenantId: ctx.tenantId, mergedIntoId: loser.id, id: { not: loser.id } },
        data: { mergedIntoId: winner.id },
      });
      const moved = await tx.partyExternalIdentity.updateMany({
        where: { tenantId: ctx.tenantId, partyId: loser.id },
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
        previousValues: {
          status: 'ACTIVE',
          winner: pick(winner, Object.keys(winnerChanges) as MergeField[]),
        } as Prisma.InputJsonValue,
        newValues: {
          status: 'MERGED',
          mergedIntoId: winner.id,
          takenFromLoser: winnerChanges,
          redirectsRepointed: redirected.count,
          externalIdentitiesMoved: moved.count,
        } as Prisma.InputJsonValue,
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.PARTY_MERGED,
        aggregateType: 'Party',
        aggregateId: winner.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { winnerId: winner.id, loserId: loser.id },
      });
      return { ...toView(survivor), duplicate: false };
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

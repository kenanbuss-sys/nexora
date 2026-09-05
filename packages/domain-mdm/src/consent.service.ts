import { writeAudit } from '@nexora/audit';
import type { ConsentChannel, PrismaClient } from '@nexora/db';
import { notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Consent management (MDM/GDPR). Records are append-only: the current
 * state per channel is the newest row, and every grant or revocation
 * stays on record with who captured it and when — nothing is ever
 * edited or deleted.
 */

export interface ConsentStateView {
  channel: ConsentChannel;
  granted: boolean | null;
  recordedAt: string | null;
}

export interface ConsentRecordView {
  id: string;
  channel: ConsentChannel;
  granted: boolean;
  note: string | null;
  recordedAt: string;
}

const CHANNELS: ConsentChannel[] = ['EMAIL', 'PHONE', 'SMS', 'POST'];

export class ConsentService {
  constructor(private readonly prisma: PrismaClient) {}

  private async assertParty(partyId: string, ctx: RequestContext): Promise<void> {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, tenantId: ctx.tenantId },
    });
    if (!party) throw notFound('Party', partyId);
  }

  /** Current state per channel (null = never asked) plus recent history. */
  async consents(
    partyId: string,
    ctx: RequestContext,
  ): Promise<{ current: ConsentStateView[]; history: ConsentRecordView[] }> {
    await this.assertParty(partyId, ctx);
    const records = await this.prisma.consentRecord.findMany({
      where: { tenantId: ctx.tenantId, partyId },
      orderBy: { recordedAt: 'desc' },
      take: 50,
    });
    const current: ConsentStateView[] = CHANNELS.map((channel) => {
      const latest = records.find((r) => r.channel === channel);
      return {
        channel,
        granted: latest ? latest.granted : null,
        recordedAt: latest ? latest.recordedAt.toISOString() : null,
      };
    });
    return {
      current,
      history: records.map((r) => ({
        id: r.id,
        channel: r.channel,
        granted: r.granted,
        note: r.note,
        recordedAt: r.recordedAt.toISOString(),
      })),
    };
  }

  /** Appends a grant or revocation. Audited; never overwrites history. */
  async record(
    input: {
      partyId: string;
      channel: ConsentChannel;
      granted: boolean;
      note?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<ConsentRecordView> {
    await this.assertParty(input.partyId, ctx);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.consentRecord.create({
        data: {
          tenantId: ctx.tenantId,
          partyId: input.partyId,
          channel: input.channel,
          granted: input.granted,
          note: input.note?.trim() || null,
          recordedBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'mdm.consent.record',
        objectType: 'ConsentRecord',
        objectId: created.id,
        source: 'api',
        newValues: { partyId: input.partyId, channel: input.channel, granted: input.granted },
      });
      return created;
    });
    return {
      id: row.id,
      channel: row.channel,
      granted: row.granted,
      note: row.note,
      recordedAt: row.recordedAt.toISOString(),
    };
  }
}

import { createHash } from 'node:crypto';
import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * FIN-033 (Sprint 233) — posting proposals from precedents, DRAFT-ONLY.
 *
 * AI risk class "recommendation → draft" (14_AI_GOVERNANCE): the proposal
 * is derived deterministically from this legal entity's own POSTED
 * entries (same partner, or description keywords), uses only accounts
 * from its chart, and its confidence is computed in CODE — never by a
 * model: HIGH ≥ 3 matching precedents, MEDIUM 1–2, LOW 0 (no lines).
 * Accepting a proposal creates a ledger DRAFT only; posting stays the
 * existing human review step (finance.ledger.post). Provenance (the
 * precedent entries and the proposal hash) is audited.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Entry types that are not business precedents. */
const NON_PRECEDENT = ['STORNO', 'OPENING_BALANCE', 'HISTORY'];
const MAX_PRECEDENTS = 200;

export type ProposalConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export function confidenceFor(matches: number): ProposalConfidence {
  if (matches >= 3) return 'HIGH';
  if (matches >= 1) return 'MEDIUM';
  return 'LOW';
}

export interface PostingProposalLine {
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  partnerId: string | null;
  debit: string;
  credit: string;
  /** Set when the account must still be chosen by the person. */
  note?: string | undefined;
}

export interface PostingProposal {
  legalEntityId: string;
  basis: 'partner' | 'text';
  confidence: ProposalConfidence;
  matchingPrecedents: number;
  consideredPrecedents: number;
  precedents: Array<{
    entryId: string;
    entryNo: number | null;
    bookingDate: string;
    description: string;
  }>;
  entryType: string | null;
  lines: PostingProposalLine[];
  warnings: string[];
  proposalHash: string;
}

type PrecedentEntry = Prisma.GlJournalEntryGetPayload<{ include: { lines: true } }>;

interface SignatureGroup {
  items: SignatureItem[];
  weights: Map<string, number[]>;
  entries: PrecedentEntry[];
}

interface SignatureItem {
  key: string;
  accountId: string;
  side: 'D' | 'C';
  partnerLine: boolean;
}

const cents = (v: number | string | Prisma.Decimal): number => Math.round(Number(v) * 100);
const money = (c: number): string => (c / 100).toFixed(2);

function tokens(text: string | undefined): string[] {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);
  return [...new Set(words)].slice(0, 5);
}

/** Splits an amount in cents by weights; the residual goes to the largest share. */
function allocate(totalC: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0) || 1;
  const parts = weights.map((w) => Math.round((totalC * w) / sum));
  const diff = totalC - parts.reduce((s, p) => s + p, 0);
  if (diff !== 0 && parts.length) {
    let idx = 0;
    for (let i = 1; i < parts.length; i += 1) if (weights[i]! > weights[idx]!) idx = i;
    parts[idx]! += diff;
  }
  return parts;
}

export class PostingProposalService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ledger: {
      createDraft(
        input: {
          legalEntityId: string;
          entryType: string;
          bookingDate: string;
          description: string;
          lines: Array<{ accountId: string; debit: number; credit: number; partnerId?: string }>;
        },
        ctx: RequestContext,
      ): Promise<{ id: string }>;
    },
  ) {}

  private async legalEntity(legalEntityId: string, ctx: RequestContext) {
    const entity = await this.prisma.legalEntity.findFirst({
      where: { id: legalEntityId, tenantId: ctx.tenantId },
    });
    if (!entity) throw notFound('LegalEntity', legalEntityId);
  }

  async propose(
    input: {
      legalEntityId: string;
      partnerId?: string | undefined;
      text?: string | undefined;
      amount: number;
    },
    ctx: RequestContext,
  ): Promise<PostingProposal> {
    const amountC = cents(input.amount);
    if (!(amountC > 0)) throw new DomainError('VALIDATION_FAILED', 'The amount must be positive');
    const words = tokens(input.text);
    if (!input.partnerId && words.length === 0) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Give a partner or a description with at least one word of 3+ letters',
      );
    }
    await this.legalEntity(input.legalEntityId, ctx);
    if (input.partnerId) {
      const party = await this.prisma.party.findFirst({
        where: { id: input.partnerId, tenantId: ctx.tenantId },
      });
      if (!party) throw notFound('Party', input.partnerId);
    }

    const basis: 'partner' | 'text' = input.partnerId ? 'partner' : 'text';
    const baseWhere: Prisma.GlJournalEntryWhereInput = {
      tenantId: ctx.tenantId,
      legalEntityId: input.legalEntityId,
      status: 'POSTED',
      stornoOfId: null,
      stornoedById: null,
      entryType: { notIn: NON_PRECEDENT },
    };
    let entries: PrecedentEntry[] = input.partnerId
      ? await this.prisma.glJournalEntry.findMany({
          where: { ...baseWhere, lines: { some: { partnerId: input.partnerId } } },
          include: { lines: true },
          orderBy: [{ bookingDate: 'desc' }, { entryNo: 'desc' }],
          take: MAX_PRECEDENTS,
        })
      : [];
    // Narrow partner precedents by keywords when given; fall back to all.
    if (entries.length && words.length) {
      const narrowed = entries.filter((e) =>
        words.some((w) => e.description.toLowerCase().includes(w)),
      );
      if (narrowed.length) entries = narrowed;
    }
    if (!input.partnerId) {
      entries = await this.prisma.glJournalEntry.findMany({
        where: {
          ...baseWhere,
          OR: words.map((w) => ({ description: { contains: w, mode: 'insensitive' as const } })),
        },
        include: { lines: true },
        orderBy: [{ bookingDate: 'desc' }, { entryNo: 'desc' }],
        take: MAX_PRECEDENTS,
      });
    }

    // Group precedents by their posting signature (accounts + sides).
    const groups = new Map<string, SignatureGroup>();
    for (const e of entries) {
      const debitC = e.lines.reduce((s, l) => s + cents(l.debit), 0);
      const creditC = e.lines.reduce((s, l) => s + cents(l.credit), 0);
      if (debitC <= 0 || creditC <= 0) continue;
      const merged = new Map<string, { item: SignatureItem; amountC: number }>();
      for (const l of e.lines) {
        const side: 'D' | 'C' = cents(l.debit) > 0 ? 'D' : 'C';
        const partnerLine = !!l.partnerId && l.partnerId === (input.partnerId ?? l.partnerId);
        // Partner lines of other partners (text basis) are generalized.
        const generic = !!l.partnerId && basis === 'text';
        const key = `${side}:${generic || (partnerLine && basis === 'partner') ? 'PARTNER' : l.accountId}`;
        const amountC = side === 'D' ? cents(l.debit) : cents(l.credit);
        const prev = merged.get(key);
        if (prev) prev.amountC += amountC;
        else
          merged.set(key, {
            item: { key, accountId: l.accountId, side, partnerLine: key.endsWith('PARTNER') },
            amountC,
          });
      }
      const signature = [...merged.keys()].sort().join('|');
      const group: SignatureGroup = groups.get(signature) ?? {
        items: [],
        weights: new Map(),
        entries: [],
      };
      if (!group.items.length) group.items = [...merged.values()].map((m) => m.item);
      for (const m of merged.values()) {
        const share = m.amountC / (m.item.side === 'D' ? debitC : creditC);
        const list = group.weights.get(m.item.key) ?? [];
        list.push(share);
        group.weights.set(m.item.key, list);
      }
      group.entries.push(e);
      groups.set(signature, group);
    }
    // Most frequent signature wins; ties go to the most recent (entries are sorted).
    let best: SignatureGroup | null = null;
    for (const g of groups.values()) {
      if (!best || g.entries.length > best.entries.length) best = g;
    }

    const warnings: string[] = [];
    const matches = best?.entries.length ?? 0;
    const confidence = confidenceFor(matches);
    const lines: PostingProposalLine[] = [];
    if (best) {
      const accountIds = best.items.filter((i) => !i.partnerLine).map((i) => i.accountId);
      const accounts = await this.prisma.glAccount.findMany({
        where: {
          tenantId: ctx.tenantId,
          legalEntityId: input.legalEntityId,
          id: { in: accountIds },
        },
      });
      const byId = new Map(accounts.map((a) => [a.id, a]));
      // Partner account for the REQUESTED partner (same prefix as the precedent's).
      const partnerAccountFor = async (precedentAccountId: string) => {
        if (!input.partnerId) return null;
        const precedent = await this.prisma.glAccount.findFirst({
          where: { id: precedentAccountId, tenantId: ctx.tenantId },
        });
        if (!precedent) return null;
        if (precedent.partnerId === input.partnerId && precedent.active) return precedent;
        return this.prisma.glAccount.findFirst({
          where: {
            tenantId: ctx.tenantId,
            legalEntityId: input.legalEntityId,
            partnerId: input.partnerId,
            active: true,
            code: { startsWith: precedent.code.slice(0, 4) },
          },
        });
      };
      for (const side of ['D', 'C'] as const) {
        const items = best.items
          .filter((i) => i.side === side)
          .sort((a, b) => a.key.localeCompare(b.key));
        const weights = items.map((i) => {
          const list = best!.weights.get(i.key) ?? [0];
          return list.reduce((s, v) => s + v, 0) / list.length;
        });
        const parts = allocate(amountC, weights);
        for (let k = 0; k < items.length; k += 1) {
          const item = items[k]!;
          const account = item.partnerLine
            ? await partnerAccountFor(item.accountId)
            : (byId.get(item.accountId) ?? null);
          let note: string | undefined;
          let usable = account;
          if (item.partnerLine && !account) {
            note = input.partnerId
              ? 'Partner nema analitičko konto s ovim prefiksom — izaberite konto'
              : 'Konto partnera izaberite ručno (prijedlog je po opisu)';
          } else if (account && !account.active) {
            note = `Konto ${account.code} je neaktivno — izaberite drugo`;
            usable = null;
          }
          if (note) warnings.push(note);
          lines.push({
            accountId: usable?.id ?? null,
            accountCode: usable?.code ?? null,
            accountName: usable?.name ?? null,
            partnerId: item.partnerLine ? (input.partnerId ?? null) : null,
            debit: side === 'D' ? money(parts[k]!) : '0.00',
            credit: side === 'C' ? money(parts[k]!) : '0.00',
            ...(note ? { note } : {}),
          });
        }
      }
    } else {
      warnings.push('Nema proknjiženih presedana — nalog sastavite ručno (sigurnost NISKA).');
    }

    const precedents = (best?.entries ?? []).slice(0, 5).map((e) => ({
      entryId: e.id,
      entryNo: e.entryNo,
      bookingDate: e.bookingDate.toISOString().slice(0, 10),
      description: e.description,
    }));
    const proposalHash = createHash('sha256')
      .update(
        JSON.stringify([
          input.legalEntityId,
          lines.map((l) => [l.accountId, l.debit, l.credit]),
          (best?.entries ?? []).map((e) => e.id),
        ]),
      )
      .digest('hex')
      .slice(0, 32);
    return {
      legalEntityId: input.legalEntityId,
      basis,
      confidence,
      matchingPrecedents: matches,
      consideredPrecedents: entries.length,
      precedents,
      entryType: best?.entries[0]?.entryType ?? null,
      lines,
      warnings,
      proposalHash,
    };
  }

  /**
   * Accept a (possibly edited) proposal as a ledger DRAFT. Never posts —
   * the draft goes through the existing review/post step. The ledger
   * validates balance-on-post, accounts and sides; here we require the
   * precedents to be this tenant's posted entries and audit provenance.
   */
  async acceptAsDraft(
    input: {
      legalEntityId: string;
      bookingDate: string;
      description: string;
      lines: Array<{
        accountId: string;
        debit: number;
        credit: number;
        partnerId?: string | undefined;
      }>;
      proposalHash: string;
      confidence: ProposalConfidence;
      precedentEntryIds: string[];
    },
    ctx: RequestContext,
  ): Promise<{ entryId: string; status: 'DRAFT' }> {
    if (!DATE_RE.test(input.bookingDate)) {
      throw new DomainError('VALIDATION_FAILED', 'Booking date must be YYYY-MM-DD');
    }
    await this.legalEntity(input.legalEntityId, ctx);
    const ids = [...new Set(input.precedentEntryIds)];
    if (ids.length) {
      const found = await this.prisma.glJournalEntry.count({
        where: {
          id: { in: ids },
          tenantId: ctx.tenantId,
          legalEntityId: input.legalEntityId,
          status: 'POSTED',
        },
      });
      if (found !== ids.length) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'Unknown precedent entries for this legal entity',
        );
      }
    }
    const debitC = input.lines.reduce((s, l) => s + cents(l.debit), 0);
    const creditC = input.lines.reduce((s, l) => s + cents(l.credit), 0);
    if (debitC !== creditC) {
      throw new DomainError('VALIDATION_FAILED', 'Debit and credit must balance', {
        totalDebit: money(debitC),
        totalCredit: money(creditC),
      });
    }
    const draft = await this.ledger.createDraft(
      {
        legalEntityId: input.legalEntityId,
        entryType: 'MANUAL',
        bookingDate: input.bookingDate,
        description: input.description,
        lines: input.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          ...(l.partnerId ? { partnerId: l.partnerId } : {}),
        })),
      },
      ctx,
    );
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'fin.posting_proposal.draft',
      objectType: 'GlJournalEntry',
      objectId: draft.id,
      source: 'api',
      newValues: {
        aiRiskClass: 'draft',
        proposalHash: input.proposalHash,
        confidence: input.confidence,
        precedentEntryIds: ids,
      } as Prisma.InputJsonValue,
    });
    return { entryId: draft.id, status: 'DRAFT' };
  }
}

/**
 * AI-016 — optional document-vision port. A provider reads a scanned
 * document (bank statement) and returns a STRUCTURED PROPOSAL only:
 * the person reviews and explicitly imports/confirms it through the
 * manual FIN-030 flow. The port never posts, never writes — the manual
 * flow works identically without any provider configured.
 */

export interface VisionStatementLineProposal {
  bookingDate: string;
  description: string;
  amount: number;
  reference?: string | undefined;
  counterpartyName?: string | undefined;
}

export interface VisionStatementProposal {
  statementNumber: string;
  bankAccount: string;
  statementDate: string;
  currency: string;
  openingBalance: number;
  closingBalance: number;
  lines: VisionStatementLineProposal[];
}

export interface VisionExtractionResult {
  /** 'dev' marks the development stand-in — NEVER a production result. */
  providerKind: 'dev' | 'production';
  confidence: number;
  proposal: VisionStatementProposal | null;
  warnings: string[];
}

export interface VisionPort {
  extractBankStatement(input: {
    content: string;
    mimeType: string;
  }): Promise<VisionExtractionResult>;
}

/**
 * Development adapter: deterministic, provider-free. It only parses
 * content that is already structured JSON (the shape a real provider
 * would produce), so the review flow is exercisable end-to-end. It is
 * explicitly marked 'dev' and must never be wired in production.
 */
export class DevVisionAdapter implements VisionPort {
  async extractBankStatement(input: {
    content: string;
    mimeType: string;
  }): Promise<VisionExtractionResult> {
    const warnings = [
      'Razvojni vision adapter (dev) — rezultat nije produkcijski i služi samo za pregled toka.',
    ];
    try {
      const parsed = JSON.parse(input.content) as Record<string, unknown>;
      const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
      const proposal: VisionStatementProposal = {
        statementNumber: String(parsed.statementNumber ?? ''),
        bankAccount: String(parsed.bankAccount ?? ''),
        statementDate: String(parsed.statementDate ?? ''),
        currency: String(parsed.currency ?? 'EUR'),
        openingBalance: Number(parsed.openingBalance ?? 0),
        closingBalance: Number(parsed.closingBalance ?? 0),
        lines: lines
          .map((l) => l as Record<string, unknown>)
          .filter((l) => Number.isFinite(Number(l.amount)))
          .map((l) => ({
            bookingDate: String(l.bookingDate ?? ''),
            description: String(l.description ?? ''),
            amount: Number(l.amount),
            reference: typeof l.reference === 'string' ? l.reference : undefined,
            counterpartyName:
              typeof l.counterpartyName === 'string' ? l.counterpartyName : undefined,
          })),
      };
      if (proposal.statementNumber === '' || proposal.lines.length === 0) {
        return { providerKind: 'dev', confidence: 0, proposal: null, warnings };
      }
      return { providerKind: 'dev', confidence: 0.5, proposal, warnings };
    } catch {
      return {
        providerKind: 'dev',
        confidence: 0,
        proposal: null,
        warnings: [...warnings, 'Sadržaj nije prepoznat — unesite izvod ručno.'],
      };
    }
  }
}

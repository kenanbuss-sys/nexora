/**
 * Bank feed port (FIN-013). Bank/PSD2 integrations (open-banking
 * aggregators, bank APIs, statement files) stay behind this port —
 * the domain sees normalized transactions only.
 */

export interface BankTransaction {
  externalRef: string;
  amount: number;
  currency: string;
  date: string;
  description: string;
  /** Optional remittance hint: the invoice number being paid. */
  invoiceNumber?: string | undefined;
}

export interface BankFeedPort {
  fetchTransactions(tenantId: string): Promise<BankTransaction[]>;
}

/**
 * Development adapter: transactions come from tenant configuration
 * (`fin.bankFeed.transactions`), so the full import/match flow is
 * exercisable without a bank connection.
 */
export class DevBankFeedAdapter implements BankFeedPort {
  constructor(
    private readonly configuration: {
      getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
    },
  ) {}

  async fetchTransactions(tenantId: string): Promise<BankTransaction[]> {
    const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
    const fin = ((config as Record<string, unknown>).fin ?? {}) as Record<string, unknown>;
    const feed = (fin.bankFeed ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(feed.transactions) ? feed.transactions : [];
    return raw
      .map((entry) => entry as Record<string, unknown>)
      .filter((t) => typeof t.externalRef === 'string' && Number.isFinite(Number(t.amount)))
      .map((t) => ({
        externalRef: t.externalRef as string,
        amount: Number(t.amount),
        currency: typeof t.currency === 'string' ? t.currency : 'EUR',
        date: typeof t.date === 'string' ? t.date : new Date().toISOString(),
        description: typeof t.description === 'string' ? t.description : '',
        invoiceNumber: typeof t.invoiceNumber === 'string' ? t.invoiceNumber : undefined,
      }));
  }
}

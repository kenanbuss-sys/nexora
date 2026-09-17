'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

/**
 * FIN-030/031 (Sprint 213) — bank statements & closure. Import with
 * control sums, review, explicit confirmation, partial allocation of
 * lines to invoices (no ledger posting). AI-016: optional vision
 * extraction returns a proposal that the person reviews before import.
 */

interface LegalEntity {
  id: string;
  name: string;
}

interface StatementRow {
  id: string;
  statementNumber: string;
  bankAccount: string;
  statementDate: string;
  currency: string;
  openingBalance: string;
  closingBalance: string;
  lineCount: number;
  status: string;
  source: string;
}

interface LineView {
  id: string;
  seq: number;
  bookingDate: string;
  description: string;
  reference: string | null;
  counterpartyName: string | null;
  amount: string;
  allocatedAmount: string;
  status: string;
}

interface StatementView extends StatementRow {
  lines: LineView[];
}

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  total: string;
  paidAmount: string;
  status: string;
  currency: string;
}

interface DraftLine {
  bookingDate: string;
  description: string;
  amount: string;
  reference: string;
  counterpartyName: string;
}

interface ExtractResult {
  providerKind: string;
  confidence: number;
  warnings: string[];
  proposal: {
    statementNumber: string;
    bankAccount: string;
    statementDate: string;
    currency: string;
    openingBalance: number;
    closingBalance: number;
    lines: Array<{
      bookingDate: string;
      description: string;
      amount: number;
      reference?: string;
      counterpartyName?: string;
    }>;
  } | null;
}

const LINE_BADGE: Record<string, string> = {
  OPEN: 'badge-warn',
  PARTIALLY_ALLOCATED: 'badge-accent',
  ALLOCATED: 'badge-ok',
};

const emptyLine = (): DraftLine => ({
  bookingDate: new Date().toISOString().slice(0, 10),
  description: '',
  amount: '',
  reference: '',
  counterpartyName: '',
});

export default function BankPage() {
  const { can } = useApp();
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [entityId, setEntityId] = useState('');
  const [tab, setTab] = useState<'statements' | 'import'>('statements');
  const [statements, setStatements] = useState<StatementRow[]>([]);
  const [open, setOpen] = useState<StatementView | null>(null);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Import form.
  const [stmtNumber, setStmtNumber] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [stmtDate, setStmtDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('EUR');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [closingBalance, setClosingBalance] = useState('0');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([emptyLine()]);
  const [fromProposal, setFromProposal] = useState(false);

  // AI extraction (AI-016).
  const [visionContent, setVisionContent] = useState('');
  const [visionWarnings, setVisionWarnings] = useState<string[]>([]);

  // Allocation form (per open statement).
  const [allocLineId, setAllocLineId] = useState('');
  const [allocInvoiceId, setAllocInvoiceId] = useState('');
  const [allocAmount, setAllocAmount] = useState('');

  useEffect(() => {
    api<{ legalEntities: LegalEntity[] }>('GET', '/api/v1/organization/tree')
      .then((r) => {
        setEntities(r.legalEntities);
        if (r.legalEntities[0]) setEntityId((prev) => prev || r.legalEntities[0]!.id);
      })
      .catch((e: unknown) => setError(errorText(e)));
    api<{ invoices: InvoiceOption[] }>('GET', '/api/v1/finance/invoices')
      .then((r) => setInvoices(r.invoices))
      .catch(() => setInvoices([]));
  }, []);

  const load = useCallback(() => {
    if (!entityId) return;
    api<{ statements: StatementRow[] }>('GET', `/api/v1/bank/statements?legalEntityId=${entityId}`)
      .then((r) => {
        setStatements(r.statements);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [entityId]);

  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>, successText: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successText) setNotice(successText);
      load();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function openStatement(id: string) {
    try {
      setOpen(await api<StatementView>('GET', `/api/v1/bank/statements/${id}`));
      setAllocLineId('');
      setAllocAmount('');
    } catch (e: unknown) {
      setError(errorText(e));
    }
  }

  const turnover = draftLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const expectedClosing = (Number(openingBalance) || 0) + turnover;
  const sumsMatch = Math.abs(expectedClosing - (Number(closingBalance) || 0)) < 0.005;

  function setLine(i: number, patch: Partial<DraftLine>) {
    setDraftLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function importStatement(e: React.FormEvent) {
    e.preventDefault();
    const lines = draftLines.filter((l) => l.description && l.amount);
    await run(async () => {
      await api('POST', '/api/v1/bank/statements', {
        legalEntityId: entityId,
        statementNumber: stmtNumber,
        bankAccount,
        statementDate: stmtDate,
        currency,
        openingBalance: Number(openingBalance),
        closingBalance: Number(closingBalance),
        lineCount: lines.length,
        source: fromProposal ? 'AI_PROPOSAL' : 'MANUAL',
        lines: lines.map((l) => ({
          bookingDate: l.bookingDate,
          description: l.description,
          amount: Number(l.amount),
          ...(l.reference ? { reference: l.reference } : {}),
          ...(l.counterpartyName ? { counterpartyName: l.counterpartyName } : {}),
        })),
      });
      setStmtNumber('');
      setDraftLines([emptyLine()]);
      setFromProposal(false);
      setVisionWarnings([]);
      setTab('statements');
    }, 'Izvod uvezen — pregledajte i potvrdite.');
  }

  async function extractProposal() {
    await run(async () => {
      const result = await api<ExtractResult>('POST', '/api/v1/bank/statements/extract', {
        content: visionContent,
        mimeType: 'application/json',
      });
      setVisionWarnings(result.warnings);
      if (!result.proposal) return;
      const p = result.proposal;
      setStmtNumber(p.statementNumber);
      setBankAccount(p.bankAccount);
      setStmtDate(p.statementDate);
      setCurrency(p.currency);
      setOpeningBalance(String(p.openingBalance));
      setClosingBalance(String(p.closingBalance));
      setDraftLines(
        p.lines.map((l) => ({
          bookingDate: l.bookingDate,
          description: l.description,
          amount: String(l.amount),
          reference: l.reference ?? '',
          counterpartyName: l.counterpartyName ?? '',
        })),
      );
      setFromProposal(true);
    }, 'Prijedlog učitan — provjerite podatke prije uvoza.');
  }

  async function allocate(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    const key = `alloc-${allocLineId.slice(0, 8)}-${allocInvoiceId.slice(0, 8)}-${allocAmount}`;
    await run(async () => {
      await api('POST', '/api/v1/bank/allocations', {
        statementLineId: allocLineId,
        invoiceId: allocInvoiceId,
        amount: Number(allocAmount),
        allocationKey: key,
      });
      await openStatement(open.id);
      setAllocAmount('');
    }, 'Stavka rasporedjena na fakturu (bez knjiženja u glavnu knjigu).');
  }

  const openInvoices = invoices.filter((i) => i.status === 'OPEN' || i.status === 'PARTIALLY_PAID');

  return (
    <div>
      <div className="spread">
        <h1>Banka — izvodi i zatvaranje</h1>
        <select
          className="input"
          value={entityId}
          onChange={(e) => {
            setEntityId(e.target.value);
            setOpen(null);
          }}
        >
          {entities.map((le) => (
            <option key={le.id} value={le.id}>
              {le.name}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="alert alert-error">{error}</p> : null}
      {notice ? <p className="alert alert-ok">{notice}</p> : null}

      <div className="tabs">
        <button
          className={tab === 'statements' ? 'btn btn-primary' : 'btn'}
          onClick={() => setTab('statements')}
        >
          Izvodi
        </button>
        {can('finance.pay') ? (
          <button
            className={tab === 'import' ? 'btn btn-primary' : 'btn'}
            onClick={() => setTab('import')}
          >
            Uvoz izvoda
          </button>
        ) : null}
      </div>

      {tab === 'statements' ? (
        <div className="grid-2">
          <div className="card">
            <h2>Izvodi</h2>
            {statements.length === 0 ? <p>Nema uvezenih izvoda.</p> : null}
            {statements.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Broj</th>
                    <th>Datum</th>
                    <th>Saldo</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map((s) => (
                    <tr key={s.id} onClick={() => void openStatement(s.id)}>
                      <td>
                        {s.statementNumber}
                        {s.source === 'AI_PROPOSAL' ? ' (AI prijedlog)' : ''}
                      </td>
                      <td>{s.statementDate}</td>
                      <td>
                        {s.openingBalance} → {s.closingBalance} {s.currency}
                      </td>
                      <td>
                        <span
                          className={`badge ${s.status === 'CONFIRMED' ? 'badge-ok' : 'badge-warn'}`}
                        >
                          {s.status === 'CONFIRMED' ? 'POTVRĐEN' : 'NA PREGLEDU'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
          <div className="card">
            {!open ? <p>Odaberite izvod za pregled i zatvaranje.</p> : null}
            {open ? (
              <div>
                <div className="spread">
                  <h2>
                    Izvod {open.statementNumber} — {open.statementDate}
                  </h2>
                  {can('finance.pay') && open.status === 'IMPORTED' ? (
                    <span>
                      <button
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api('POST', `/api/v1/bank/statements/${open.id}/confirm`);
                            await openStatement(open.id);
                          }, 'Izvod potvrđen.')
                        }
                      >
                        Potvrdi izvod
                      </button>{' '}
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api('DELETE', `/api/v1/bank/statements/${open.id}`);
                            setOpen(null);
                          }, 'Izvod odbačen.')
                        }
                      >
                        Odbaci
                      </button>
                    </span>
                  ) : null}
                </div>
                <p>
                  Račun {open.bankAccount} · {open.openingBalance} → {open.closingBalance}{' '}
                  {open.currency}
                </p>
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Datum</th>
                      <th>Opis</th>
                      <th>Iznos</th>
                      <th>Raspoređeno</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.seq}</td>
                        <td>{l.bookingDate}</td>
                        <td>
                          {l.description}
                          {l.reference ? ` (${l.reference})` : ''}
                        </td>
                        <td>{l.amount}</td>
                        <td>{l.allocatedAmount}</td>
                        <td>
                          <span className={`badge ${LINE_BADGE[l.status] ?? ''}`}>{l.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {open.status === 'IMPORTED' ? (
                  <p className="alert alert-warn">
                    Izvod je na pregledu — zatvaranje je moguće tek nakon izričite potvrde.
                  </p>
                ) : null}
                {can('finance.pay') && open.status === 'CONFIRMED' ? (
                  <form onSubmit={allocate}>
                    <h3>Zatvaranje stavke (bez knjiženja)</h3>
                    <p>
                      Raspoređivanje povezuje uplatu s fakturom kroz postojeći tok plaćanja; ne
                      stvara novi nalog u glavnoj knjizi.
                    </p>
                    <select
                      className="input"
                      value={allocLineId}
                      onChange={(e) => setAllocLineId(e.target.value)}
                      required
                    >
                      <option value="">Stavka izvoda…</option>
                      {open.lines
                        .filter((l) => l.status !== 'ALLOCATED')
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            #{l.seq} {l.description} ({l.amount})
                          </option>
                        ))}
                    </select>
                    <select
                      className="input"
                      value={allocInvoiceId}
                      onChange={(e) => setAllocInvoiceId(e.target.value)}
                      required
                    >
                      <option value="">Faktura…</option>
                      {openInvoices.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.invoiceNumber} ({i.invoiceType}) otvoreno{' '}
                          {(Number(i.total) - Number(i.paidAmount)).toFixed(2)} {i.currency}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Iznos"
                      value={allocAmount}
                      onChange={(e) => setAllocAmount(e.target.value)}
                      required
                    />
                    <button className="btn btn-primary" disabled={busy} type="submit">
                      Rasporedi
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'import' && can('finance.pay') ? (
        <div className="grid-2">
          <div className="card">
            <h2>Uvoz izvoda</h2>
            <form onSubmit={importStatement}>
              <input
                className="input"
                placeholder="Broj izvoda"
                value={stmtNumber}
                onChange={(e) => setStmtNumber(e.target.value)}
                required
              />
              <input
                className="input"
                placeholder="Bankovni račun (IBAN)"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                required
              />
              <input
                className="input"
                type="date"
                value={stmtDate}
                onChange={(e) => setStmtDate(e.target.value)}
                required
              />
              <input
                className="input"
                placeholder="Valuta"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                required
              />
              <input
                className="input"
                type="number"
                step="0.01"
                placeholder="Početno stanje"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                required
              />
              <input
                className="input"
                type="number"
                step="0.01"
                placeholder="Završno stanje"
                value={closingBalance}
                onChange={(e) => setClosingBalance(e.target.value)}
                required
              />
              <h3>Stavke</h3>
              {draftLines.map((l, i) => (
                <div key={i} className="spread">
                  <input
                    className="input"
                    type="date"
                    value={l.bookingDate}
                    onChange={(e) => setLine(i, { bookingDate: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Opis"
                    value={l.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                  />
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    placeholder="Iznos (+/−)"
                    value={l.amount}
                    onChange={(e) => setLine(i, { amount: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Referenca"
                    value={l.reference}
                    onChange={(e) => setLine(i, { reference: e.target.value })}
                  />
                </div>
              ))}
              <button
                className="btn"
                type="button"
                onClick={() => setDraftLines((prev) => [...prev, emptyLine()])}
              >
                + stavka
              </button>
              <p>
                Kontrolni zbir: {Number(openingBalance) || 0} + {turnover.toFixed(2)} ={' '}
                {expectedClosing.toFixed(2)}{' '}
                <span className={`badge ${sumsMatch ? 'badge-ok' : 'badge-warn'}`}>
                  {sumsMatch ? 'USKLAĐEN' : 'NEUSKLAĐEN'}
                </span>
              </p>
              <button className="btn btn-primary" disabled={busy || !sumsMatch} type="submit">
                Uvezi izvod
              </button>
            </form>
          </div>
          <div className="card">
            <h2>AI prijedlog (opciono)</h2>
            <p>
              AI čita skenirani dokument i vraća samo prijedlog — ništa se ne uvozi ni ne knjiži bez
              vaše provjere i izričite potvrde. Ručni uvoz radi i bez AI providera.
            </p>
            <textarea
              className="input"
              rows={8}
              placeholder="Sadržaj dokumenta izvoda…"
              value={visionContent}
              onChange={(e) => setVisionContent(e.target.value)}
            />
            <button
              className="btn"
              type="button"
              disabled={busy || visionContent.length < 2}
              onClick={() => void extractProposal()}
            >
              Izvuci prijedlog
            </button>
            {visionWarnings.map((w, i) => (
              <p key={i} className="alert alert-warn">
                {w}
              </p>
            ))}
            {fromProposal ? (
              <p className="alert alert-warn">
                Forma je popunjena iz AI prijedloga — provjerite svaki podatak prije uvoza.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

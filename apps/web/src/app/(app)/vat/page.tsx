'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiRequestError, errorText } from '../../../lib/api';
import { submissionResolvedByError } from '../../../lib/idempotency';
import { useApp } from '../app-shell';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '../../../components/ui';

/**
 * FIN-028 (Sprint 232) — KUF/KIF books and PDV (VAT) periods, BiH pack.
 * Pure presentation: VAT amounts, totals, reconciliation and period
 * state all come from the server; the UI never computes VAT. Actions are
 * hidden without the permission, but the server remains authoritative.
 */

type BookType = 'KIF' | 'KUF';
type Tab = 'KIF' | 'KUF' | 'new' | 'period' | 'rates';

interface VatBookEntryView {
  id: string;
  bookType: string;
  year: number;
  bookNo: number;
  status: string;
  documentNumber: string;
  documentDate: string;
  bookingDate: string;
  partnerId: string;
  partnerName: string;
  partnerTaxId: string | null;
  vatRateCode: string;
  ratePct: string;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  currency: string;
  glEntryId: string | null;
  stornoOfId: string | null;
  stornoReason: string | null;
}

interface BookView {
  rows: VatBookEntryView[];
  totals: { net: string; vat: string; gross: string };
  from: string;
  to: string;
}

interface SideTotals {
  count: number;
  net: string;
  vat: string;
  gross: string;
}

interface PeriodSummary {
  status: string;
  from: string;
  to: string;
  kif: SideTotals;
  kuf: SideTotals;
  outputVat: string;
  inputVat: string;
  payableVat: string;
  pendingEntries: number;
  ledger: { outputVat: string; inputVat: string; reconciled: boolean } | null;
  filedAt: string | null;
  settlementEntryId: string | null;
  paidAt: string | null;
  paidReference: string | null;
}

interface PeriodRow {
  year: number;
  month: number;
  status: string;
  outputVat: string | null;
  inputVat: string | null;
  payableVat: string | null;
  filedAt: string | null;
  paidAt: string | null;
}

interface RateView {
  id: string;
  code: string;
  name: string;
  ratePct: string;
  validFrom: string;
}

interface AccountView {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

interface PartyOption {
  id: string;
  name: string;
}

interface EntryBody {
  legalEntityId: string;
  bookType: BookType;
  documentNumber: string;
  documentDate: string;
  bookingDate: string;
  partnerId: string;
  vatRateCode: string;
  netAmount: number;
  currency: string;
  counterAccountId: string;
}

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

/** FIN-033 — server suggestion from the partner's earlier entries (read-only). */
interface VatSuggestion {
  confidence: Confidence;
  matchingPrecedents: number;
  consideredPrecedents: number;
  counterAccountId: string | null;
  counterAccountCode: string | null;
  counterAccountName: string | null;
  vatRateCode: string | null;
  precedents: Array<{
    id: string;
    bookNo: number;
    year: number;
    documentNumber: string;
    bookingDate: string;
  }>;
}

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  HIGH: 'Visoka',
  MEDIUM: 'Srednja',
  LOW: 'Niska',
};

const CONFIDENCE_BADGE: Record<Confidence, string> = {
  HIGH: 'badge-ok',
  MEDIUM: 'badge-warn',
  LOW: 'badge-danger',
};

const MONTHS = [
  'Januar',
  'Februar',
  'Mart',
  'April',
  'Maj',
  'Juni',
  'Juli',
  'August',
  'Septembar',
  'Oktobar',
  'Novembar',
  'Decembar',
];

const ENTRY_STATUS_LABELS: Record<string, string> = {
  RECORDED: 'Proknjiženo',
  STORNOED: 'Stornirano',
  STORNO: 'Storno stavka',
};

const ENTRY_STATUS_BADGE: Record<string, string> = {
  RECORDED: 'badge-ok',
  STORNOED: 'badge-warn',
  STORNO: 'badge-danger',
};

const PERIOD_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Otvoren',
  FILING: 'U podnošenju',
  FILED: 'Podnesen',
};

const PERIOD_STATUS_BADGE: Record<string, string> = {
  OPEN: 'badge-accent',
  FILING: 'badge-warn',
  FILED: 'badge-ok',
};

const SYSTEM_ROLES = ['vat.output', 'vat.input', 'vat.settlement'];

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('bs-BA') : '—');
const entryStatusLabel = (s: string) => ENTRY_STATUS_LABELS[s] ?? s;
const periodStatusLabel = (s: string) => PERIOD_STATUS_LABELS[s] ?? s;

/** API error text; a 403 gets an explicit Bosnian "no permission" message. */
function vatErrorText(e: unknown): string {
  if (e instanceof ApiRequestError && (e.status === 403 || e.body.code === 'FORBIDDEN')) {
    return 'Nemate pravo za ovu radnju — zatražite od administratora odgovarajuću finansijsku permisiju.';
  }
  return errorText(e);
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

export default function VatPage() {
  const { can, entities, legalEntityId: entityId } = useApp();
  const canRead = can('finance.ledger.read');
  const canPost = can('finance.ledger.post');
  const canManage = can('finance.ledger.manage');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<Tab>('KIF');
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reads.
  const [book, setBook] = useState<BookView | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PeriodRow[] | null>(null);
  const [rates, setRates] = useState<RateView[] | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [parties, setParties] = useState<PartyOption[] | null>(null);

  // Storno.
  const [stornoTarget, setStornoTarget] = useState<VatBookEntryView | null>(null);
  const [stornoReason, setStornoReason] = useState('');

  // New entry form.
  const [fBookType, setFBookType] = useState<BookType>('KIF');
  const [fPartnerId, setFPartnerId] = useState('');
  const [fDocNo, setFDocNo] = useState('');
  const [fDocDate, setFDocDate] = useState(today);
  const [fBookingDate, setFBookingDate] = useState(today);
  const [fRateCode, setFRateCode] = useState('');
  const [fNet, setFNet] = useState('');
  const [fCurrency, setFCurrency] = useState('BAM');
  const [fAccountId, setFAccountId] = useState('');
  const [confirmEntry, setConfirmEntry] = useState(false);
  const [lastRecorded, setLastRecorded] = useState<VatBookEntryView | null>(null);
  // One idempotency key per intended entry. After an uncertain outcome
  // the key AND the submitted content are kept until the submission
  // resolves — a later form edit can never silently turn the retry into
  // a second entry (the retry resends the pending content).
  const pendingEntryRef = useRef<{ key: string; body: EntryBody } | null>(null);
  const [hasPending, setHasPending] = useState(false);
  // Suggestion (FIN-033): only prefills the form; never records anything.
  const [suggestion, setSuggestion] = useState<VatSuggestion | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  // Bumped on every partner/book change so a late response is ignored.
  const suggestSeq = useRef(0);

  // Period actions.
  const [confirmFile, setConfirmFile] = useState(false);
  const [paidDialog, setPaidDialog] = useState(false);
  const [paidAt, setPaidAt] = useState(today);
  const [paidRef, setPaidRef] = useState('');

  // Rates configuration.
  const [confirmPack, setConfirmPack] = useState(false);
  const [confirmRate, setConfirmRate] = useState(false);
  const [rCode, setRCode] = useState('');
  const [rName, setRName] = useState('');
  const [rPct, setRPct] = useState('');
  const [rValidFrom, setRValidFrom] = useState(today);

  const bookTab: BookType | null = tab === 'KIF' || tab === 'KUF' ? tab : null;

  // ---------------------------------------------------------------- reads
  useEffect(() => {
    if (!canRead || !entityId || !bookTab) return;
    let cancelled = false;
    setBook(null);
    setBookError(null);
    api<BookView>(
      'GET',
      `/api/v1/vat/books?legalEntityId=${entityId}&bookType=${bookTab}&year=${year}&month=${month}`,
    )
      .then((r) => {
        if (!cancelled) setBook(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setBookError(vatErrorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [canRead, entityId, bookTab, year, month, tick]);

  useEffect(() => {
    if (!canRead || !entityId) return;
    let cancelled = false;
    setSummary(null);
    setSummaryError(null);
    api<PeriodSummary>(
      'GET',
      `/api/v1/vat/periods/summary?legalEntityId=${entityId}&year=${year}&month=${month}`,
    )
      .then((r) => {
        if (!cancelled) setSummary(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setSummaryError(vatErrorText(e));
      });
    api<{ periods: PeriodRow[] }>('GET', `/api/v1/vat/periods?legalEntityId=${entityId}`)
      .then((r) => {
        if (!cancelled) setPeriods(r.periods);
      })
      .catch(() => {
        if (!cancelled) setPeriods([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canRead, entityId, year, month, tick]);

  useEffect(() => {
    if (!canRead || !entityId) return;
    let cancelled = false;
    setRates(null);
    setRatesError(null);
    api<{ rates: RateView[] }>('GET', `/api/v1/vat/rates?legalEntityId=${entityId}`)
      .then((r) => {
        if (!cancelled) setRates(r.rates);
      })
      .catch((e: unknown) => {
        if (!cancelled) setRatesError(vatErrorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [canRead, entityId, tick]);

  useEffect(() => {
    if (!canPost || !entityId) return;
    let cancelled = false;
    api<{ accounts: AccountView[] }>('GET', `/api/v1/ledger/accounts?legalEntityId=${entityId}`)
      .then((r) => {
        if (!cancelled) setAccounts(r.accounts.filter((a) => a.active));
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canPost, entityId]);

  useEffect(() => {
    if (!canPost) return;
    api<{ parties: PartyOption[] }>('GET', '/api/v1/parties')
      .then((r) => setParties(r.parties))
      .catch(() => setParties([]));
  }, [canPost]);

  /** Unique rate codes with their latest version (display only). */
  const rateCodes = useMemo(() => {
    const latest = new Map<string, RateView>();
    for (const r of rates ?? []) {
      const prev = latest.get(r.code);
      if (!prev || r.validFrom > prev.validFrom) latest.set(r.code, r);
    }
    return [...latest.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [rates]);

  async function run(fn: () => Promise<unknown>, successText: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successText) setNotice(successText);
      reload();
    } catch (e: unknown) {
      setError(vatErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Asks the server for the partner's usual counter account and rate and
   * prefills them (the user can still change both). A pending unresolved
   * submission is unaffected: its retry resends the ref-held content.
   */
  async function suggest() {
    if (!fPartnerId || !entityId) return;
    const seq = ++suggestSeq.current;
    setSuggesting(true);
    setSuggestError(null);
    setSuggestion(null);
    try {
      const r = await api<VatSuggestion>(
        'GET',
        `/api/v1/vat/suggest?legalEntityId=${entityId}&bookType=${fBookType}&partnerId=${fPartnerId}`,
      );
      if (seq !== suggestSeq.current) return;
      setSuggestion(r);
      if (r.counterAccountId && (accounts ?? []).some((a) => a.id === r.counterAccountId)) {
        setFAccountId(r.counterAccountId);
      }
      if (r.vatRateCode && rateCodes.some((x) => x.code === r.vatRateCode)) {
        setFRateCode(r.vatRateCode);
      }
    } catch (e: unknown) {
      if (seq === suggestSeq.current) setSuggestError(vatErrorText(e));
    } finally {
      setSuggesting(false);
    }
  }

  if (!canRead) {
    return (
      <main className="page">
        <h1>PDV · KUF/KIF</h1>
        <ErrorState text="Pristup PDV knjigama zahtijeva finansijsku permisiju (finance.ledger.read)." />
      </main>
    );
  }

  const entityName = entities.find((le) => le.id === entityId)?.name ?? '—';
  const periodLabel = `${MONTHS[month - 1]} ${year}.`;
  const partyName = (id: string) => (parties ?? []).find((p) => p.id === id)?.name ?? '—';
  const accountLabel = (id: string) => {
    const a = (accounts ?? []).find((x) => x.id === id);
    return a ? `${a.code} — ${a.name}` : '—';
  };
  const rateLabel = (code: string) => {
    const r = rateCodes.find((x) => x.code === code);
    return r ? `${r.code} — ${r.name} (${r.ratePct}%)` : code;
  };

  const currentBody = (): EntryBody => ({
    legalEntityId: entityId,
    bookType: fBookType,
    documentNumber: fDocNo.trim(),
    documentDate: fDocDate,
    bookingDate: fBookingDate,
    partnerId: fPartnerId,
    vatRateCode: fRateCode,
    netAmount: Number(fNet),
    currency: fCurrency.trim().toUpperCase(),
    counterAccountId: fAccountId,
  });
  const dialogBody = pendingEntryRef.current?.body ?? currentBody();

  const bookColumns: Array<Column<VatBookEntryView>> = [
    {
      key: 'no',
      header: 'Rb.',
      render: (r) => (
        <span className="mono">
          {r.bookNo}/{r.year}
        </span>
      ),
      text: (r) => `${r.bookNo}/${r.year}`,
    },
    {
      key: 'booking',
      header: 'Datum knjiženja',
      render: (r) => <span className="mono">{r.bookingDate}</span>,
      text: (r) => r.bookingDate,
    },
    {
      key: 'doc',
      header: 'Dokument',
      render: (r) => (
        <span>
          {r.documentNumber}
          <br />
          <span className="muted mono" style={{ fontSize: 12 }}>
            {r.documentDate}
          </span>
        </span>
      ),
      text: (r) => r.documentNumber,
    },
    {
      key: 'partner',
      header: 'Partner',
      render: (r) => (
        <span>
          {r.partnerName}
          {r.partnerTaxId ? (
            <>
              <br />
              <span className="muted mono" style={{ fontSize: 12 }}>
                {r.partnerTaxId}
              </span>
            </>
          ) : null}
        </span>
      ),
      text: (r) => `${r.partnerName} ${r.partnerTaxId ?? ''}`,
    },
    {
      key: 'rate',
      header: 'Stopa',
      render: (r) => (
        <span className="mono">
          {r.vatRateCode} · {r.ratePct}%
        </span>
      ),
      text: (r) => r.vatRateCode,
    },
    {
      key: 'net',
      header: 'Osnovica',
      align: 'right',
      render: (r) => <span className="mono">{r.netAmount}</span>,
    },
    {
      key: 'vat',
      header: 'PDV',
      align: 'right',
      render: (r) => <span className="mono">{r.vatAmount}</span>,
    },
    {
      key: 'gross',
      header: 'Ukupno',
      align: 'right',
      render: (r) => (
        <span className="mono">
          {r.grossAmount} {r.currency}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span className={`badge ${ENTRY_STATUS_BADGE[r.status] ?? ''}`}>
          {entryStatusLabel(r.status)}
        </span>
      ),
      text: (r) => entryStatusLabel(r.status),
    },
    {
      key: 'actions',
      header: '',
      render: (r) =>
        canPost && r.status === 'RECORDED' ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => {
              setStornoReason('');
              setStornoTarget(r);
            }}
          >
            Storniraj
          </button>
        ) : null,
    },
  ];

  const periodColumns: Array<Column<PeriodRow>> = [
    {
      key: 'period',
      header: 'Period',
      render: (p) => `${MONTHS[p.month - 1]} ${p.year}.`,
      text: (p) => `${MONTHS[p.month - 1]} ${p.year}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <span className={`badge ${PERIOD_STATUS_BADGE[p.status] ?? ''}`}>
          {periodStatusLabel(p.status)}
        </span>
      ),
    },
    {
      key: 'out',
      header: 'Izlazni',
      align: 'right',
      render: (p) => <span className="mono">{p.outputVat ?? '—'}</span>,
    },
    {
      key: 'in',
      header: 'Ulazni',
      align: 'right',
      render: (p) => <span className="mono">{p.inputVat ?? '—'}</span>,
    },
    {
      key: 'pay',
      header: 'Obaveza',
      align: 'right',
      render: (p) => <span className="mono">{p.payableVat ?? '—'}</span>,
    },
    { key: 'filed', header: 'Podnesen', render: (p) => fmtDate(p.filedAt) },
    { key: 'paid', header: 'Plaćen', render: (p) => fmtDate(p.paidAt) },
  ];

  const rateColumns: Array<Column<RateView>> = [
    {
      key: 'code',
      header: 'Šifra',
      render: (r) => <span className="mono">{r.code}</span>,
      text: (r) => r.code,
    },
    { key: 'name', header: 'Naziv', render: (r) => r.name, text: (r) => r.name },
    {
      key: 'pct',
      header: 'Stopa',
      align: 'right',
      render: (r) => <span className="mono">{r.ratePct}%</span>,
    },
    {
      key: 'from',
      header: 'Važi od',
      render: (r) => <span className="mono">{r.validFrom}</span>,
      text: (r) => r.validFrom,
    },
  ];

  const tabButton = (t: Tab, label: string) => (
    <button
      type="button"
      className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`}
      onClick={() => setTab(t)}
      aria-pressed={tab === t}
    >
      {label}
    </button>
  );

  const payableNegative = summary ? Number(summary.payableVat) < 0 : false;
  const periodClosed = summary?.status === 'FILED';
  const formComplete =
    !!fPartnerId && !!fDocNo.trim() && !!fRateCode && Number(fNet) > 0 && !!fAccountId;
  const counterLabel = fBookType === 'KIF' ? 'Konto prihoda' : 'Konto troška';

  return (
    <main className="page">
      <h1>PDV · KUF/KIF</h1>
      <p className="page-sub">
        Knjige ulaznih (KUF) i izlaznih (KIF) faktura, PDV period i stope — BiH lokalizacija. PDV
        obračunava server.
      </p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
        Aktivno pravno lice: <strong>{entityName}</strong> (mijenja se u traci iznad)
      </p>

      <div className="row" style={{ marginBottom: 12 }}>
        <select
          className="input"
          style={{ maxWidth: 150 }}
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          aria-label="Mjesec"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          className="input"
          style={{ maxWidth: 110 }}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          aria-label="Godina"
        >
          {Array.from({ length: 7 }, (_, i) => now.getFullYear() - 5 + i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        {tabButton('KIF', 'KIF')}
        {tabButton('KUF', 'KUF')}
        {canPost ? tabButton('new', 'Novi unos') : null}
        {tabButton('period', 'PDV period')}
        {tabButton('rates', 'Stope PDV-a')}
      </div>

      {entities.length === 0 ? (
        <EmptyState text="Nema pravnih lica. Kreirajte pravno lice u organizaciji prije rada s PDV knjigama." />
      ) : null}

      {/* ------------------------------------------------------ KIF / KUF */}
      {bookTab && entityId ? (
        <div className="card">
          <div className="spread" style={{ flexWrap: 'wrap' }}>
            <h2>
              {bookTab === 'KIF' ? 'KIF — knjiga izlaznih faktura' : 'KUF — knjiga ulaznih faktura'}{' '}
              · {periodLabel}
            </h2>
            <button type="button" className="btn btn-sm" onClick={() => window.print()}>
              Štampaj
            </button>
          </div>
          {bookError ? <ErrorState text={bookError} /> : null}
          {!book && !bookError ? <LoadingState text="Učitavanje knjige…" /> : null}
          {book ? (
            <>
              <p className="muted mono" style={{ fontSize: 12.5 }}>
                {book.from} – {book.to}
              </p>
              <DataTable
                columns={bookColumns}
                rows={book.rows}
                rowKey={(r) => r.id}
                searchPlaceholder="Pretraga (dokument, partner)…"
                pageSize={25}
                emptyText={`Nema ${bookTab} stavki u periodu ${periodLabel}`}
              />
              {book.rows.length > 0 ? (
                <table className="table" style={{ marginTop: 10 }}>
                  <tbody>
                    <tr>
                      <td>
                        <strong>Ukupno {bookTab}</strong>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        Osnovica <strong className="mono">{book.totals.net}</strong>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        PDV <strong className="mono">{book.totals.vat}</strong>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        Ukupno <strong className="mono">{book.totals.gross}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : null}
              {!canPost ? (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  Storno stavki zahtijeva permisiju finance.ledger.post.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------------ Novi unos */}
      {tab === 'new' && entityId && canPost ? (
        <div className="grid-2">
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              setConfirmEntry(true);
            }}
          >
            <h2>Novi KUF/KIF unos</h2>
            {hasPending ? (
              <p className="alert alert-warn">
                Prethodni unos nije potvrđen od servera. Ponovno slanje šalje RANIJE PREDANI sadržaj
                pod istim ključem (bez duplikata); izmjene forme idu u novi unos nakon razrješenja.
              </p>
            ) : null}
            <label className="label">Knjiga</label>
            <select
              className="input"
              value={fBookType}
              onChange={(e) => {
                setFBookType(e.target.value as BookType);
                setFAccountId('');
                suggestSeq.current++;
                setSuggestion(null);
                setSuggestError(null);
              }}
            >
              <option value="KIF">KIF — izlazna faktura</option>
              <option value="KUF">KUF — ulazna faktura</option>
            </select>
            <label className="label">Partner</label>
            {parties === null ? (
              <LoadingState text="Učitavanje partnera…" />
            ) : parties.length === 0 ? (
              <EmptyState text="Nema partnera — dodajte partnera u Partnerima." />
            ) : (
              <select
                className="input"
                value={fPartnerId}
                onChange={(e) => {
                  setFPartnerId(e.target.value);
                  suggestSeq.current++;
                  setSuggestion(null);
                  setSuggestError(null);
                }}
                required
              >
                <option value="">Partner…</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginTop: 6 }}
              disabled={!fPartnerId || suggesting || busy}
              onClick={() => void suggest()}
            >
              {suggesting ? 'Tražim ranije unose…' : 'Predloži konto i stopu'}
            </button>
            {!fPartnerId ? (
              <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
                Prijedlog je dostupan nakon izbora partnera.
              </p>
            ) : null}
            {suggestError ? <ErrorState text={suggestError} /> : null}
            {suggestion ? (
              suggestion.counterAccountId === null && suggestion.vatRateCode === null ? (
                <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
                  Nema ranijih unosa ovog partnera — izaberite ručno.
                </p>
              ) : (
                <div className="alert alert-warn" style={{ marginTop: 6, fontSize: 12.5 }}>
                  <div>
                    Prijedlog (popunjeno u formi, možete izmijeniti) · sigurnost{' '}
                    <span className={`badge ${CONFIDENCE_BADGE[suggestion.confidence]}`}>
                      {CONFIDENCE_LABELS[suggestion.confidence]}
                    </span>{' '}
                    · na osnovu {suggestion.matchingPrecedents} ranijih unosa (razmotreno{' '}
                    {suggestion.consideredPrecedents})
                  </div>
                  <div>
                    {counterLabel}:{' '}
                    {suggestion.counterAccountCode ? (
                      <span className="mono">
                        {suggestion.counterAccountCode} — {suggestion.counterAccountName ?? ''}
                      </span>
                    ) : (
                      'nije predložen'
                    )}{' '}
                    · Stopa:{' '}
                    {suggestion.vatRateCode ? (
                      <span className="mono">{suggestion.vatRateCode}</span>
                    ) : (
                      'nije predložena'
                    )}
                  </div>
                  {suggestion.counterAccountId &&
                  !(accounts ?? []).some((a) => a.id === suggestion.counterAccountId) ? (
                    <div>Predloženi konto nije među aktivnim kontima — izaberite ručno.</div>
                  ) : null}
                  {suggestion.vatRateCode &&
                  !rateCodes.some((x) => x.code === suggestion.vatRateCode) ? (
                    <div>Predložena stopa nije konfigurisana — izaberite ručno.</div>
                  ) : null}
                  {suggestion.precedents.length > 0 ? (
                    <div>
                      Dokumenti:{' '}
                      {suggestion.precedents.map((p, i) => (
                        <span key={p.id} className="mono">
                          {p.documentNumber} ({p.bookNo}/{p.year}, {p.bookingDate})
                          {i < suggestion.precedents.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="muted">
                    Sigurnost je izračunata pravilom: ≥3 presedana visoka, 1–2 srednja, 0 niska — ne
                    procjenjuje je AI
                  </div>
                </div>
              )
            ) : null}
            <label className="label">Broj dokumenta</label>
            <input
              className="input"
              value={fDocNo}
              onChange={(e) => setFDocNo(e.target.value)}
              maxLength={60}
              required
            />
            <div className="grid-2" style={{ gap: 10 }}>
              <div>
                <label className="label">Datum dokumenta</label>
                <input
                  className="input"
                  type="date"
                  value={fDocDate}
                  onChange={(e) => setFDocDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Datum knjiženja</label>
                <input
                  className="input"
                  type="date"
                  value={fBookingDate}
                  onChange={(e) => setFBookingDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <label className="label">Stopa PDV-a</label>
            {rates === null && !ratesError ? <LoadingState text="Učitavanje stopa…" /> : null}
            {ratesError ? <ErrorState text={ratesError} /> : null}
            {rates !== null && rateCodes.length === 0 ? (
              <EmptyState text="Nema PDV stopa — instalirajte BiH paket na kartici „Stope PDV-a“." />
            ) : null}
            {rateCodes.length > 0 ? (
              <select
                className="input"
                value={fRateCode}
                onChange={(e) => setFRateCode(e.target.value)}
                required
              >
                <option value="">Stopa…</option>
                {rateCodes.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} — {r.name} ({r.ratePct}%)
                  </option>
                ))}
              </select>
            ) : null}
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
              PDV obračunava server po stopi važećoj na datum dokumenta.
            </p>
            <div className="grid-2" style={{ gap: 10 }}>
              <div>
                <label className="label">Osnovica</label>
                <input
                  className="input mono"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={fNet}
                  onChange={(e) => setFNet(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Valuta</label>
                <input
                  className="input mono"
                  value={fCurrency}
                  onChange={(e) => setFCurrency(e.target.value)}
                  maxLength={3}
                  required
                />
              </div>
            </div>
            <label className="label">{counterLabel}</label>
            {accounts === null ? (
              <LoadingState text="Učitavanje konta…" />
            ) : accounts.length === 0 ? (
              <EmptyState text="Nema aktivnih konta — dodajte konto u Glavnoj knjizi." />
            ) : (
              <select
                className="input"
                value={fAccountId}
                onChange={(e) => setFAccountId(e.target.value)}
                required
              >
                <option value="">{counterLabel}…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className="btn btn-primary"
              style={{ marginTop: 12 }}
              disabled={busy || (!formComplete && !hasPending)}
              type="submit"
            >
              {hasPending ? 'Ponovi slanje' : 'Pregledaj i proknjiži'}
            </button>
            {!formComplete && !hasPending ? (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Popunite partnera, broj dokumenta, stopu, osnovicu (&gt; 0) i konto.
              </p>
            ) : null}
          </form>

          <div className="card">
            <h2>Rezultat</h2>
            {lastRecorded ? (
              <>
                <Fact label="Knjiga / Rb.">
                  <span className="mono">
                    {lastRecorded.bookType} {lastRecorded.bookNo}/{lastRecorded.year}
                  </span>
                </Fact>
                <Fact label="Dokument">{lastRecorded.documentNumber}</Fact>
                <Fact label="Partner">{lastRecorded.partnerName}</Fact>
                <Fact label="Stopa">
                  {lastRecorded.vatRateCode} · {lastRecorded.ratePct}%
                </Fact>
                <Fact label="Osnovica">
                  <span className="mono">{lastRecorded.netAmount}</span>
                </Fact>
                <Fact label="PDV (server)">
                  <span className="mono">{lastRecorded.vatAmount}</span>
                </Fact>
                <Fact label="Ukupno">
                  <span className="mono">
                    {lastRecorded.grossAmount} {lastRecorded.currency}
                  </span>
                </Fact>
              </>
            ) : (
              <EmptyState text="Nakon knjiženja ovdje se prikazuju broj u knjizi, PDV i ukupan iznos koje je obračunao server." />
            )}
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------ PDV period */}
      {tab === 'period' && entityId ? (
        <div className="grid-2">
          <div className="card">
            <div className="spread" style={{ flexWrap: 'wrap' }}>
              <h2>PDV period · {periodLabel}</h2>
              {summary ? (
                <span className={`badge ${PERIOD_STATUS_BADGE[summary.status] ?? ''}`}>
                  {periodStatusLabel(summary.status)}
                </span>
              ) : null}
            </div>
            {summaryError ? <ErrorState text={summaryError} /> : null}
            {!summary && !summaryError ? <LoadingState text="Učitavanje PDV perioda…" /> : null}
            {summary ? (
              <>
                <Fact label={`Izlazni PDV (KIF, ${summary.kif.count} st.)`}>
                  <span className="mono">{summary.outputVat}</span>
                </Fact>
                <Fact label={`Ulazni PDV (KUF, ${summary.kuf.count} st.)`}>
                  <span className="mono">{summary.inputVat}</span>
                </Fact>
                <Fact label={payableNegative ? 'Pravo na povrat' : 'Obaveza za uplatu'}>
                  <strong className="mono">{summary.payableVat}</strong>
                </Fact>
                <Fact label="Usklađenost s glavnom knjigom">
                  {summary.ledger ? (
                    <span>
                      <span
                        className={`badge ${summary.ledger.reconciled ? 'badge-ok' : 'badge-danger'}`}
                      >
                        {summary.ledger.reconciled ? '✓ usklađeno' : '✗ neusklađeno'}
                      </span>{' '}
                      <span className="mono" style={{ fontSize: 12.5 }}>
                        GK {summary.ledger.outputVat} / {summary.ledger.inputVat}
                      </span>
                    </span>
                  ) : (
                    <span className="muted">mapirajte sistemska konta vat.output/vat.input</span>
                  )}
                </Fact>
                <Fact label="Podnesen">{fmtDate(summary.filedAt)}</Fact>
                <Fact label="Uplata">
                  {summary.paidAt ? (
                    <span>
                      <span className="badge badge-ok">Plaćeno</span> {fmtDate(summary.paidAt)}
                      {summary.paidReference ? ` · ${summary.paidReference}` : ''}
                    </span>
                  ) : (
                    <span className="muted">nije evidentirana</span>
                  )}
                </Fact>
                {summary.pendingEntries > 0 ? (
                  <p className="alert alert-warn" style={{ marginTop: 10 }}>
                    {summary.pendingEntries} stavki se još knjiži — podnošenje će biti odbijeno dok
                    se ne završe.
                  </p>
                ) : null}
                {periodClosed ? (
                  <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                    Period je podnesen i zatvoren za nove KUF/KIF unose; ispravke idu kroz storno u
                    otvorenom periodu.
                  </p>
                ) : null}

                <div className="row" style={{ marginTop: 12 }}>
                  {canManage && (summary.status === 'OPEN' || summary.status === 'FILING') ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => setConfirmFile(true)}
                    >
                      Podnesi PDV prijavu
                    </button>
                  ) : null}
                  {canManage && summary.status === 'FILED' && !summary.paidAt ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => {
                        setPaidAt(today());
                        setPaidRef('');
                        setPaidDialog(true);
                      }}
                    >
                      Evidentiraj uplatu
                    </button>
                  ) : null}
                </div>
                {!canManage ? (
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    Podnošenje prijave i evidencija uplate zahtijevaju permisiju
                    finance.ledger.manage.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="card">
            <h2>Posljednji periodi</h2>
            {periods === null ? (
              <LoadingState text="Učitavanje perioda…" />
            ) : (
              <DataTable
                columns={periodColumns}
                rows={periods}
                rowKey={(p) => `${p.year}-${p.month}`}
                onRowClick={(p) => {
                  setYear(p.year);
                  setMonth(p.month);
                }}
                pageSize={12}
                emptyText="Još nema podnesenih ili započetih PDV perioda."
              />
            )}
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------ Stope */}
      {tab === 'rates' && entityId ? (
        <div className="grid-2">
          <div className="card">
            <div className="spread" style={{ flexWrap: 'wrap' }}>
              <h2>Stope PDV-a</h2>
              {canManage ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => setConfirmPack(true)}
                >
                  Instaliraj BiH paket
                </button>
              ) : null}
            </div>
            {ratesError ? <ErrorState text={ratesError} /> : null}
            {rates === null && !ratesError ? <LoadingState text="Učitavanje stopa…" /> : null}
            {rates !== null ? (
              <DataTable
                columns={rateColumns}
                rows={rates}
                rowKey={(r) => r.id}
                pageSize={15}
                emptyText="Nema PDV stopa. Instalirajte BiH paket (S17 17%, O0 0%)."
              />
            ) : null}
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              Potrebna sistemska konta:{' '}
              {SYSTEM_ROLES.map((r, i) => (
                <span key={r}>
                  <span className="mono">{r}</span>
                  {i < SYSTEM_ROLES.length - 1 ? ', ' : ''}
                </span>
              ))}{' '}
              — mapiraju se na stranici Glavna knjiga → sistemska konta.
            </p>
          </div>

          {canManage ? (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                setConfirmRate(true);
              }}
            >
              <h2>Nova verzija stope</h2>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
                Verzije su samo dodavanje (append-only): stavke knjižene ranije zadržavaju svoju
                stopu.
              </p>
              <label className="label">Šifra</label>
              <input
                className="input mono"
                value={rCode}
                onChange={(e) => setRCode(e.target.value)}
                placeholder="npr. S17"
                maxLength={20}
                required
              />
              <label className="label">Naziv</label>
              <input
                className="input"
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                maxLength={120}
                required
              />
              <div className="grid-2" style={{ gap: 10 }}>
                <div>
                  <label className="label">Stopa %</label>
                  <input
                    className="input mono"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={rPct}
                    onChange={(e) => setRPct(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label">Važi od</label>
                  <input
                    className="input"
                    type="date"
                    value={rValidFrom}
                    onChange={(e) => setRValidFrom(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy}>
                Dodaj verziju
              </button>
            </form>
          ) : (
            <div className="card">
              <h2>Nova verzija stope</h2>
              <p className="muted">
                Konfiguracija stopa zahtijeva permisiju finance.ledger.manage.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* ------------------------------------------------------ Dialogs */}
      {stornoTarget ? (
        <ConfirmDialog
          open
          title={`Storno ${stornoTarget.bookType} stavke ${stornoTarget.bookNo}/${stornoTarget.year}`}
          consequence="Kreira se negativna storno stavka s današnjim datumom i storno naloga u glavnoj knjizi; zaključen PDV period se ne mijenja."
          confirmLabel="Storniraj"
          danger
          busy={busy}
          onCancel={() => setStornoTarget(null)}
          onConfirm={() => {
            if (stornoReason.trim().length < 5) return;
            const target = stornoTarget;
            void run(async () => {
              await api('POST', `/api/v1/vat/entries/${target.id}/storno`, {
                reason: stornoReason.trim(),
              });
              setStornoTarget(null);
            }, `Stavka ${target.bookNo}/${target.year} je stornirana.`);
          }}
        >
          <Fact label="Knjiga">{stornoTarget.bookType}</Fact>
          <Fact label="Rb.">
            <span className="mono">
              {stornoTarget.bookNo}/{stornoTarget.year}
            </span>
          </Fact>
          <Fact label="Dokument">
            {stornoTarget.documentNumber} · {stornoTarget.documentDate}
          </Fact>
          <Fact label="Partner">{stornoTarget.partnerName}</Fact>
          <Fact label="Osnovica / PDV / Ukupno">
            <span className="mono">
              {stornoTarget.netAmount} / {stornoTarget.vatAmount} / {stornoTarget.grossAmount}{' '}
              {stornoTarget.currency}
            </span>
          </Fact>
          <label className="label">Razlog storna (obavezno)</label>
          <input
            className="input"
            value={stornoReason}
            onChange={(e) => setStornoReason(e.target.value)}
            placeholder="min. 5 znakova"
            maxLength={400}
          />
          {stornoReason.trim().length < 5 ? (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              Razlog je obavezan — najmanje 5 znakova.
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {confirmEntry ? (
        <ConfirmDialog
          open
          title={hasPending ? 'Ponovno slanje KUF/KIF unosa' : 'Knjiženje KUF/KIF unosa'}
          consequence={
            hasPending
              ? 'Prethodno slanje nije potvrđeno — šalje se RANIJE PREDANI sadržaj pod istim ključem (bez duplikata).'
              : 'Server obračunava PDV po stopi važećoj na datum dokumenta i knjiži JEDAN KUF/KIF nalog u glavnoj knjizi.'
          }
          confirmLabel="Proknjiži"
          busy={busy}
          onCancel={() => setConfirmEntry(false)}
          onConfirm={() =>
            void run(async () => {
              if (!pendingEntryRef.current) {
                pendingEntryRef.current = { key: crypto.randomUUID(), body: currentBody() };
                setHasPending(true);
              }
              const pending = pendingEntryRef.current;
              let r: VatBookEntryView;
              try {
                r = await api<VatBookEntryView>('POST', '/api/v1/vat/entries', {
                  ...pending.body,
                  requestKey: pending.key,
                });
              } catch (e) {
                // Discard key+content only on a business-unambiguous
                // rejection; CONFLICT, 401/403, 5xx and network errors
                // keep them for a safe retry under the same key.
                if (
                  e instanceof ApiRequestError &&
                  submissionResolvedByError(e.status, e.body.code)
                ) {
                  pendingEntryRef.current = null;
                  setHasPending(false);
                }
                throw e;
              }
              pendingEntryRef.current = null;
              setHasPending(false);
              setLastRecorded(r);
              setFDocNo('');
              setFNet('');
              setConfirmEntry(false);
              setNotice(
                `${r.bookType} ${r.bookNo}/${r.year} proknjižen — PDV ${r.vatAmount}, ukupno ${r.grossAmount} ${r.currency}.`,
              );
            }, null)
          }
        >
          <Fact label="Pravno lice">{entityName}</Fact>
          <Fact label="Knjiga">{dialogBody.bookType}</Fact>
          <Fact label="Partner">{partyName(dialogBody.partnerId)}</Fact>
          <Fact label="Dokument">
            {dialogBody.documentNumber} · {dialogBody.documentDate}
          </Fact>
          <Fact label="Datum knjiženja">{dialogBody.bookingDate}</Fact>
          <Fact label="Stopa">{rateLabel(dialogBody.vatRateCode)}</Fact>
          <Fact label="Osnovica">
            <span className="mono">
              {dialogBody.netAmount} {dialogBody.currency}
            </span>
          </Fact>
          <Fact label={dialogBody.bookType === 'KIF' ? 'Konto prihoda' : 'Konto troška'}>
            {accountLabel(dialogBody.counterAccountId)}
          </Fact>
          <Fact label="PDV">obračunava server</Fact>
        </ConfirmDialog>
      ) : null}

      {confirmFile && summary ? (
        <ConfirmDialog
          open
          title={`Podnošenje PDV prijave · ${periodLabel}`}
          consequence="Knjiži se jedan nalog zatvaranja PDV-a (vat.output/vat.input → vat.settlement) sa zadnjim danom mjeseca; period se zatvara za nove KUF/KIF unose."
          confirmLabel="Podnesi prijavu"
          busy={busy}
          onCancel={() => setConfirmFile(false)}
          onConfirm={() =>
            void run(async () => {
              await api('POST', '/api/v1/vat/periods/file', {
                legalEntityId: entityId,
                year,
                month,
              });
              setConfirmFile(false);
            }, `PDV prijava za ${periodLabel} je podnesena.`)
          }
        >
          <Fact label="Pravno lice">{entityName}</Fact>
          <Fact label="Period">
            <span className="mono">
              {summary.from} – {summary.to}
            </span>
          </Fact>
          <Fact label="Izlazni PDV (KIF)">
            <span className="mono">{summary.outputVat}</span>
          </Fact>
          <Fact label="Ulazni PDV (KUF)">
            <span className="mono">{summary.inputVat}</span>
          </Fact>
          <Fact label={payableNegative ? 'Pravo na povrat' : 'Obaveza'}>
            <span className="mono">{summary.payableVat}</span>
          </Fact>
          <Fact label="Usklađeno s GK">
            {summary.ledger ? (summary.ledger.reconciled ? '✓ da' : '✗ ne') : 'nije mapirano'}
          </Fact>
        </ConfirmDialog>
      ) : null}

      {paidDialog && summary ? (
        <ConfirmDialog
          open
          title={`Evidencija uplate PDV-a · ${periodLabel}`}
          consequence="Evidentira se samo status uplate — ne knjiži; uplata se knjiži kroz bankovni izvod."
          confirmLabel="Evidentiraj uplatu"
          busy={busy}
          onCancel={() => setPaidDialog(false)}
          onConfirm={() => {
            if (!paidAt || !paidRef.trim()) return;
            void run(async () => {
              await api('POST', '/api/v1/vat/periods/paid', {
                legalEntityId: entityId,
                year,
                month,
                paidAt,
                reference: paidRef.trim(),
              });
              setPaidDialog(false);
            }, `Uplata PDV-a za ${periodLabel} je evidentirana.`);
          }}
        >
          <Fact label="Pravno lice">{entityName}</Fact>
          <Fact label={payableNegative ? 'Pravo na povrat' : 'Obaveza'}>
            <span className="mono">{summary.payableVat}</span>
          </Fact>
          <label className="label">Datum uplate</label>
          <input
            className="input"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
          <label className="label">Referenca (obavezno)</label>
          <input
            className="input"
            value={paidRef}
            onChange={(e) => setPaidRef(e.target.value)}
            maxLength={120}
            placeholder="npr. broj izvoda / naloga"
          />
          {!paidRef.trim() ? (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              Referenca je obavezna.
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {confirmPack ? (
        <ConfirmDialog
          open
          title="Instalacija BiH PDV paketa"
          consequence="Dodaju se samo nedostajuće zadane verzije stopa (S17 17%, O0 0%); postojeće se ne mijenjaju — ponovno pokretanje je bezopasno."
          confirmLabel="Instaliraj"
          busy={busy}
          onCancel={() => setConfirmPack(false)}
          onConfirm={() =>
            void run(async () => {
              const r = await api<{ created: number; requiredSystemAccounts: string[] }>(
                'POST',
                '/api/v1/vat/pack/bih',
                { legalEntityId: entityId },
              );
              setConfirmPack(false);
              setNotice(
                `BiH paket: dodano ${r.created} verzija stopa. Potrebna sistemska konta: ${r.requiredSystemAccounts.join(', ')}.`,
              );
            }, null)
          }
        >
          <Fact label="Pravno lice">{entityName}</Fact>
          <Fact label="Stope">S17 — 17%, O0 — 0%</Fact>
        </ConfirmDialog>
      ) : null}

      {confirmRate ? (
        <ConfirmDialog
          open
          title="Nova verzija PDV stope"
          consequence="Verzija se dodaje trajno (append-only); ranije knjižene stavke zadržavaju svoju stopu."
          confirmLabel="Dodaj verziju"
          busy={busy}
          onCancel={() => setConfirmRate(false)}
          onConfirm={() =>
            void run(async () => {
              await api('POST', '/api/v1/vat/rates', {
                legalEntityId: entityId,
                code: rCode.trim(),
                name: rName.trim(),
                ratePct: Number(rPct),
                validFrom: rValidFrom,
              });
              setConfirmRate(false);
              setRCode('');
              setRName('');
              setRPct('');
            }, 'Nova verzija stope je dodana.')
          }
        >
          <Fact label="Pravno lice">{entityName}</Fact>
          <Fact label="Šifra">
            <span className="mono">{rCode}</span>
          </Fact>
          <Fact label="Naziv">{rName}</Fact>
          <Fact label="Stopa">
            <span className="mono">{rPct}%</span>
          </Fact>
          <Fact label="Važi od">{rValidFrom}</Fact>
        </ConfirmDialog>
      ) : null}
    </main>
  );
}

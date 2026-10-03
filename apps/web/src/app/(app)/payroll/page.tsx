'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
 * HCM-013/014 (Sprint 235) — payroll and salary data. Monthly payroll
 * run (draft → confirmed immutable snapshot, worked days from the
 * Šihtarica), bonus/deduction adjustments, payslips and effective-dated
 * salary versions with management lock. Every amount is computed by the
 * server; salary visibility (FULL vs CONTRACT scope, management lock) is
 * enforced server-side — this page only renders what the API returns.
 */

type Tab = 'run' | 'adjust' | 'salaries';
type RunStatus = 'NONE' | 'DRAFT' | 'CONFIRMED';
type AdjustmentKind = 'BONUS' | 'DEDUCTION';

interface SalaryVersion {
  netAmount: string;
  currency: string;
  validFrom: string;
  note?: string | null;
}

interface SalaryRow {
  employeeId: string;
  employeeNumber: string;
  name: string;
  salaryLocked: boolean;
  current: { netAmount: string; currency: string; validFrom: string } | null;
  history?: SalaryVersion[];
}

interface SalariesView {
  scope: 'FULL' | 'CONTRACT';
  rows: SalaryRow[];
}

interface RunLine {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  baseNet: string;
  workedDays: string | number;
  fundDays: string | number;
  earned: string;
  bonuses: string;
  deductions: string;
  netTotal: string;
}

interface RunView {
  status: RunStatus;
  attendanceStatus: 'OPEN' | 'LOCKED';
  fundDays?: string | number;
  currency?: string;
  computedAt?: string | null;
  confirmedAt?: string | null;
  lines: RunLine[];
  /** Management layer only: how many visible lines are under the lock. */
  lockedLinesIncluded?: number;
  visibleTotal: string;
}

interface Payslip {
  title: string;
  status: string;
  draft: boolean;
  employeeNumber: string;
  employeeName: string;
  currency: string;
  baseNet: string;
  fundDays: string | number;
  workedDays: string | number;
  earned: string;
  adjustments: Array<{ kind: AdjustmentKind; amount: string; reason: string }>;
  bonuses: string;
  deductions: string;
  netTotal: string;
}

interface AdjustmentBody {
  year: number;
  month: number;
  employeeId: string;
  kind: AdjustmentKind;
  amount: number;
  reason: string;
}

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

const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  NONE: 'Nema obračuna',
  DRAFT: 'Nacrt',
  CONFIRMED: 'Potvrđen',
};

const RUN_STATUS_BADGE: Record<RunStatus, string> = {
  NONE: '',
  DRAFT: 'badge-warn',
  CONFIRMED: 'badge-ok',
};

const KIND_LABELS: Record<AdjustmentKind, string> = {
  BONUS: 'Bonus',
  DEDUCTION: 'Odbitak',
};

const today = () => new Date().toISOString().slice(0, 10);
const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('bs-BA') : '—';

/**
 * API error text. A 403 names the missing salary permission in the
 * server message — it is shown as-is so the person knows what to ask for.
 */
function payrollErrorText(e: unknown): string {
  if (e instanceof ApiRequestError && (e.status === 403 || e.body.code === 'FORBIDDEN')) {
    return `Nemate pravo za ovu radnju: ${e.body.message}`;
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

function Money({ amount, currency }: { amount: string; currency?: string | undefined }) {
  return (
    <span className="mono">
      {amount}
      {currency ? ` ${currency}` : ''}
    </span>
  );
}

export default function PayrollPage() {
  const { can } = useApp();
  const canRead = can('hcm.salary.read');
  const canContract = can('hcm.salary.contract');
  const canManage = can('hcm.salary.manage');
  const canLock = can('hcm.salary.management');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<Tab>(canRead ? 'run' : 'salaries');
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reads.
  const [salaries, setSalaries] = useState<SalariesView | null>(null);
  const [salariesError, setSalariesError] = useState<string | null>(null);
  const [runView, setRunView] = useState<RunView | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [payslipFor, setPayslipFor] = useState<string | null>(null);
  const [payslip, setPayslip] = useState<Payslip | null>(null);
  const [payslipError, setPayslipError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  // Run actions.
  const [confirmCompute, setConfirmCompute] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);

  // Adjustment form. One idempotency key per intended adjustment: after
  // an uncertain outcome the key AND the submitted content are kept until
  // the submission resolves — a later form edit can never silently turn
  // the retry into a second adjustment (the retry resends the pending
  // content).
  const [aEmployeeId, setAEmployeeId] = useState('');
  const [aKind, setAKind] = useState<AdjustmentKind>('BONUS');
  const [aAmount, setAAmount] = useState('');
  const [aReason, setAReason] = useState('');
  const [confirmAdjust, setConfirmAdjust] = useState(false);
  const pendingAdjRef = useRef<{ key: string; body: AdjustmentBody } | null>(null);
  const [hasPending, setHasPending] = useState(false);

  // Salary version form.
  const [sEmployeeId, setSEmployeeId] = useState('');
  const [sAmount, setSAmount] = useState('');
  const [sValidFrom, setSValidFrom] = useState(today);
  const [sNote, setSNote] = useState('');
  const [confirmSalary, setConfirmSalary] = useState(false);

  // Management lock.
  const [lockTarget, setLockTarget] = useState<SalaryRow | null>(null);

  const periodLabel = `${MONTHS[month - 1]} ${year}.`;

  // ---------------------------------------------------------------- reads
  useEffect(() => {
    if (!canRead && !canContract) return;
    let cancelled = false;
    setSalariesError(null);
    api<SalariesView>('GET', '/api/v1/payroll/salaries')
      .then((r) => {
        if (!cancelled) setSalaries(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setSalariesError(payrollErrorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [canRead, canContract, tick]);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    setRunView(null);
    setRunError(null);
    api<RunView>('GET', `/api/v1/payroll/runs?year=${year}&month=${month}`)
      .then((r) => {
        if (!cancelled) setRunView(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setRunError(payrollErrorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [canRead, year, month, tick]);

  useEffect(() => {
    if (!canRead || !payslipFor) return;
    let cancelled = false;
    setPayslip(null);
    setPayslipError(null);
    api<Payslip>(
      'GET',
      `/api/v1/payroll/payslip?year=${year}&month=${month}&employeeId=${encodeURIComponent(payslipFor)}`,
    )
      .then((r) => {
        if (!cancelled) setPayslip(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setPayslipError(payrollErrorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [canRead, payslipFor, year, month, tick]);

  async function run(fn: () => Promise<unknown>, successText: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successText) setNotice(successText);
      reload();
    } catch (e: unknown) {
      setError(payrollErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const employees = salaries?.rows ?? [];
  const employeeLabel = (id: string) => {
    const r = employees.find((x) => x.employeeId === id);
    return r ? `${r.employeeNumber} · ${r.name}` : id;
  };

  const currentAdjBody = (): AdjustmentBody => ({
    year,
    month,
    employeeId: aEmployeeId,
    kind: aKind,
    amount: Number(aAmount),
    reason: aReason.trim(),
  });

  // ------------------------------------------------------------- columns
  const lineColumns: Array<Column<RunLine>> = [
    {
      key: 'number',
      header: 'Broj',
      render: (l) => <span className="mono">{l.employeeNumber}</span>,
      text: (l) => l.employeeNumber,
    },
    { key: 'name', header: 'Ime', render: (l) => l.employeeName, text: (l) => l.employeeName },
    {
      key: 'base',
      header: 'Osnovica',
      align: 'right',
      render: (l) => <Money amount={l.baseNet} />,
    },
    {
      key: 'days',
      header: 'Radni dani / Fond',
      align: 'right',
      render: (l) => (
        <span className="mono">
          {l.workedDays} / {l.fundDays}
        </span>
      ),
    },
    {
      key: 'earned',
      header: 'Zarađeno',
      align: 'right',
      render: (l) => <Money amount={l.earned} />,
    },
    {
      key: 'bonuses',
      header: 'Bonusi',
      align: 'right',
      render: (l) => <Money amount={l.bonuses} />,
    },
    {
      key: 'deductions',
      header: 'Odbici',
      align: 'right',
      render: (l) => <Money amount={l.deductions} />,
    },
    {
      key: 'net',
      header: 'Neto',
      align: 'right',
      render: (l) => (
        <strong>
          <Money amount={l.netTotal} />
        </strong>
      ),
    },
    {
      key: 'slip',
      header: '',
      align: 'right',
      render: (l) => (
        <button
          type="button"
          className="btn btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            setPayslipFor(l.employeeId);
          }}
        >
          Listić
        </button>
      ),
    },
  ];

  const salaryColumns: Array<Column<SalaryRow>> = [
    {
      key: 'number',
      header: 'Broj',
      render: (r) => <span className="mono">{r.employeeNumber}</span>,
      text: (r) => r.employeeNumber,
    },
    { key: 'name', header: 'Ime', render: (r) => r.name, text: (r) => r.name },
    {
      key: 'net',
      header: 'Važeća neto plata',
      align: 'right',
      render: (r) =>
        r.current ? (
          <Money amount={r.current.netAmount} currency={r.current.currency} />
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'from',
      header: 'Važi od',
      render: (r) => <span className="mono">{r.current?.validFrom ?? '—'}</span>,
      text: (r) => r.current?.validFrom ?? '',
    },
    {
      key: 'locked',
      header: 'Zaključano',
      render: (r) =>
        r.salaryLocked ? (
          <span className="badge badge-warn">Upravljačko</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
          {salaries?.scope === 'FULL' && r.history ? (
            <button
              type="button"
              className="btn btn-sm"
              aria-expanded={historyFor === r.employeeId}
              onClick={(e) => {
                e.stopPropagation();
                setHistoryFor(historyFor === r.employeeId ? null : r.employeeId);
              }}
            >
              {historyFor === r.employeeId ? 'Sakrij historiju' : 'Historija'}
            </button>
          ) : null}
          {canLock ? (
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                setLockTarget(r);
              }}
            >
              {r.salaryLocked ? 'Otključaj' : 'Zaključaj'}
            </button>
          ) : null}
        </span>
      ),
    },
  ];

  const tabButton = (t: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === t}
      className={tab === t ? 'btn btn-primary' : 'btn'}
      onClick={() => setTab(t)}
    >
      {label}
    </button>
  );

  // ------------------------------------------------------------- no access
  if (!canRead && !canContract) {
    return (
      <main className="page">
        <h1>Plate</h1>
        <EmptyState text="Plate vidi samo salary krug (hcm.salary.read) ili ugovorni opseg (hcm.salary.contract)." />
      </main>
    );
  }

  const runStatus: RunStatus = runView?.status ?? 'NONE';
  const attendanceLocked = runView?.attendanceStatus === 'LOCKED';
  const historyRow = historyFor ? employees.find((r) => r.employeeId === historyFor) : undefined;
  const adjFormComplete = !!aEmployeeId && Number(aAmount) > 0 && aReason.trim().length >= 3;
  const salaryFormComplete = !!sEmployeeId && Number(sAmount) > 0 && !!sValidFrom;
  const dialogAdj = pendingAdjRef.current?.body ?? currentAdjBody();

  return (
    <main className="page">
      <h1>Plate</h1>
      <p className="page-sub">
        Mjesečni obračun plata iz šihtarice, korekcije, platni listići i važeće plate — sve iznose
        obračunava server, a pristup platama provjerava se na serveru.
      </p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="row" role="tablist" aria-label="Prikaz" style={{ marginBottom: 16 }}>
        {canRead ? tabButton('run', 'Obračun') : null}
        {canRead && canManage ? tabButton('adjust', 'Korekcije') : null}
        {tabButton('salaries', 'Plate zaposlenih')}
      </div>

      {tab !== 'salaries' && canRead ? (
        <div className="row" style={{ marginBottom: 12 }}>
          <select
            className="input"
            style={{ maxWidth: 150 }}
            value={month}
            onChange={(e) => {
              setMonth(Number(e.target.value));
              setPayslipFor(null);
            }}
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
            onChange={(e) => {
              setYear(Number(e.target.value));
              setPayslipFor(null);
            }}
            aria-label="Godina"
          >
            {Array.from({ length: 7 }, (_, i) => now.getFullYear() - 5 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* ------------------------------------------------------- Obračun */}
      {tab === 'run' && canRead ? (
        <>
          <div className="card">
            <div className="spread" style={{ flexWrap: 'wrap', gap: 8 }}>
              <h2>Obračun · {periodLabel}</h2>
              {runView ? (
                <span className="row" style={{ gap: 6 }}>
                  <span className={`badge ${RUN_STATUS_BADGE[runStatus]}`}>
                    {RUN_STATUS_LABELS[runStatus]}
                  </span>
                  <span className={`badge ${attendanceLocked ? 'badge-ok' : 'badge-warn'}`}>
                    {attendanceLocked ? 'Šihtarica zaključena' : 'Šihtarica otvorena'}
                  </span>
                  <Link href="/hr" className="btn btn-sm">
                    Šihtarica →
                  </Link>
                </span>
              ) : null}
            </div>
            {runError ? <ErrorState text={runError} /> : null}
            {!runView && !runError ? <LoadingState text="Učitavanje obračuna…" /> : null}
            {runView ? (
              <>
                <p className="muted" style={{ fontSize: 12.5 }}>
                  {runView.fundDays !== undefined ? (
                    <>
                      Fond dana: <span className="mono">{runView.fundDays}</span> ·{' '}
                    </>
                  ) : null}
                  Obračunato: {fmtDateTime(runView.computedAt)} · Potvrđeno:{' '}
                  {fmtDateTime(runView.confirmedAt)}
                </p>

                {canManage ? (
                  <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy || runStatus === 'CONFIRMED'}
                      onClick={() => setConfirmCompute(true)}
                    >
                      Obračunaj
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || runStatus !== 'DRAFT' || !attendanceLocked}
                      onClick={() => setConfirmRun(true)}
                    >
                      Potvrdi obračun
                    </button>
                  </div>
                ) : null}
                {canManage && runStatus === 'CONFIRMED' ? (
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    Obračun je potvrđen — nepromjenjiv snimak; ponovni obračun i korekcije za ovaj
                    mjesec su odbijeni.
                  </p>
                ) : null}
                {canManage && runStatus === 'NONE' ? (
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    Za ovaj mjesec još nema obračuna — „Obračunaj” kreira nacrt.
                  </p>
                ) : null}
                {canManage && runStatus === 'DRAFT' && !attendanceLocked ? (
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    Potvrda nije moguća dok je šihtarica za {periodLabel} otvorena — zaključajte je
                    u modulu <Link href="/hr">Zaposleni → Šihtarica</Link>.
                  </p>
                ) : null}

                <DataTable
                  columns={lineColumns}
                  rows={runView.lines}
                  rowKey={(l) => l.employeeId}
                  searchPlaceholder="Pretraga (broj, ime)…"
                  pageSize={25}
                  emptyText={
                    runStatus === 'NONE'
                      ? `Nema obračuna za ${periodLabel}`
                      : 'Nema vidljivih stavki obračuna.'
                  }
                />
                {runView.lines.length > 0 ? (
                  <table className="table" style={{ marginTop: 10 }}>
                    <tbody>
                      <tr>
                        <td>
                          <strong>Ukupno (vidljivo)</strong>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <strong>
                            <Money amount={runView.visibleTotal} currency={runView.currency} />
                          </strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : null}
                {(runView.lockedLinesIncluded ?? 0) > 0 ? (
                  <p className="alert alert-warn" style={{ marginTop: 10 }}>
                    Prikaz uključuje {runView.lockedLinesIncluded} zaposlenih pod upravljačkim
                    zaključavanjem (vidljivo samo upravljačkom nivou).
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          {payslipFor ? (
            <div className="card" style={{ marginTop: 16, position: 'relative' }}>
              <div className="spread" style={{ flexWrap: 'wrap', gap: 8 }}>
                <h2>{payslip?.title ?? 'Platni listić'}</h2>
                <span className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={!payslip}
                    onClick={() => window.print()}
                  >
                    Štampaj
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setPayslipFor(null)}>
                    Zatvori
                  </button>
                </span>
              </div>
              {payslipError ? <ErrorState text={payslipError} /> : null}
              {!payslip && !payslipError ? <LoadingState text="Učitavanje listića…" /> : null}
              {payslip ? (
                <>
                  {payslip.draft ? (
                    <p className="alert alert-warn" style={{ fontWeight: 700, letterSpacing: 2 }}>
                      NACRT — obračun nije potvrđen, listić nije konačan.
                    </p>
                  ) : null}
                  <Fact label="Zaposleni">
                    <span className="mono">{payslip.employeeNumber}</span> · {payslip.employeeName}
                  </Fact>
                  <Fact label="Period">{periodLabel}</Fact>
                  <Fact label="Status">{payslip.status}</Fact>
                  <Fact label="Osnovica (neto)">
                    <Money amount={payslip.baseNet} currency={payslip.currency} />
                  </Fact>
                  <Fact label="Radni dani / Fond">
                    <span className="mono">
                      {payslip.workedDays} / {payslip.fundDays}
                    </span>
                  </Fact>
                  <Fact label="Zarađeno">
                    <Money amount={payslip.earned} currency={payslip.currency} />
                  </Fact>
                  {payslip.adjustments.length > 0 ? (
                    <table className="table" style={{ margin: '10px 0' }}>
                      <thead>
                        <tr>
                          <th>Vrsta</th>
                          <th>Razlog</th>
                          <th style={{ textAlign: 'right' }}>Iznos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payslip.adjustments.map((a, i) => (
                          <tr key={`${a.kind}-${i}`}>
                            <td>{KIND_LABELS[a.kind] ?? a.kind}</td>
                            <td>{a.reason}</td>
                            <td style={{ textAlign: 'right' }}>
                              <Money amount={a.amount} currency={payslip.currency} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="muted" style={{ fontSize: 12.5 }}>
                      Nema korekcija za ovaj mjesec.
                    </p>
                  )}
                  <Fact label="Bonusi">
                    <Money amount={payslip.bonuses} currency={payslip.currency} />
                  </Fact>
                  <Fact label="Odbici">
                    <Money amount={payslip.deductions} currency={payslip.currency} />
                  </Fact>
                  <Fact label="Neto za isplatu">
                    <strong>
                      <Money amount={payslip.netTotal} currency={payslip.currency} />
                    </strong>
                  </Fact>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {/* ----------------------------------------------------- Korekcije */}
      {tab === 'adjust' && canRead && canManage ? (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setConfirmAdjust(true);
          }}
        >
          <h2>Korekcija · {periodLabel}</h2>
          <p className="muted" style={{ fontSize: 12.5 }}>
            Bonus ili odbitak za odabrani mjesec ulazi u obračun pri sljedećem „Obračunaj”. Za
            potvrđen obračun korekcije su odbijene.
          </p>
          {hasPending ? (
            <p className="alert alert-warn">
              Prethodna korekcija nije potvrđena od servera. Ponovno slanje šalje RANIJE PREDANI
              sadržaj pod istim ključem (bez duplikata); izmjene forme idu u novu korekciju nakon
              razrješenja.
            </p>
          ) : null}
          {salariesError ? <ErrorState text={salariesError} /> : null}
          <label className="label" htmlFor="adj-employee">
            Zaposleni
          </label>
          <select
            id="adj-employee"
            className="input"
            value={aEmployeeId}
            onChange={(e) => setAEmployeeId(e.target.value)}
          >
            <option value="">Odaberite zaposlenog…</option>
            {employees.map((r) => (
              <option key={r.employeeId} value={r.employeeId}>
                {r.employeeNumber} · {r.name}
              </option>
            ))}
          </select>
          <label className="label" htmlFor="adj-kind">
            Vrsta
          </label>
          <select
            id="adj-kind"
            className="input"
            value={aKind}
            onChange={(e) => setAKind(e.target.value as AdjustmentKind)}
          >
            <option value="BONUS">Bonus</option>
            <option value="DEDUCTION">Odbitak</option>
          </select>
          <label className="label" htmlFor="adj-amount">
            Iznos
          </label>
          <input
            id="adj-amount"
            className="input mono"
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            value={aAmount}
            onChange={(e) => setAAmount(e.target.value)}
          />
          <label className="label" htmlFor="adj-reason">
            Razlog
          </label>
          <input
            id="adj-reason"
            className="input"
            value={aReason}
            maxLength={400}
            placeholder="obavezno, najmanje 3 znaka"
            onChange={(e) => setAReason(e.target.value)}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || (!adjFormComplete && !hasPending)}
            >
              {hasPending ? 'Ponovi slanje' : 'Pregledaj i evidentiraj'}
            </button>
            {!adjFormComplete && !hasPending ? (
              <span className="muted" style={{ fontSize: 12.5 }}>
                Odaberite zaposlenog, unesite iznos veći od nule i razlog.
              </span>
            ) : null}
          </div>
        </form>
      ) : null}

      {/* ---------------------------------------------- Plate zaposlenih */}
      {tab === 'salaries' ? (
        <>
          <div className="card">
            <h2>Plate zaposlenih</h2>
            {salaries?.scope === 'CONTRACT' ? (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Vidite samo osnovnu platu (pravo za izradu ugovora).
              </p>
            ) : null}
            {salariesError ? <ErrorState text={salariesError} /> : null}
            {!salaries && !salariesError ? <LoadingState text="Učitavanje plata…" /> : null}
            {salaries ? (
              <DataTable
                columns={salaryColumns}
                rows={salaries.rows}
                rowKey={(r) => r.employeeId}
                searchPlaceholder="Pretraga (broj, ime)…"
                pageSize={25}
                emptyText="Nema zaposlenih s vidljivom platom."
              />
            ) : null}
            {canLock ? (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                Upravljačko zaključavanje: platu zaključanog zaposlenog vidi i mijenja samo
                upravljački nivo.
              </p>
            ) : null}
          </div>

          {salaries?.scope === 'FULL' && historyRow ? (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="spread" style={{ flexWrap: 'wrap', gap: 8 }}>
                <h2>
                  Historija plate — {historyRow.employeeNumber} · {historyRow.name}
                </h2>
                <button type="button" className="btn btn-sm" onClick={() => setHistoryFor(null)}>
                  Zatvori
                </button>
              </div>
              {historyRow.history && historyRow.history.length > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Važi od</th>
                      <th style={{ textAlign: 'right' }}>Neto plata</th>
                      <th>Napomena</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRow.history.map((h) => (
                      <tr key={h.validFrom}>
                        <td className="mono">{h.validFrom}</td>
                        <td style={{ textAlign: 'right' }}>
                          <Money amount={h.netAmount} currency={h.currency} />
                        </td>
                        <td>{h.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState text="Nema evidentiranih verzija plate." />
              )}
            </div>
          ) : null}

          {canManage ? (
            <form
              className="card"
              style={{ marginTop: 16 }}
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                setConfirmSalary(true);
              }}
            >
              <h2>Nova verzija plate</h2>
              <p className="muted" style={{ fontSize: 12.5 }}>
                Dodaje novu verziju koja važi od odabranog datuma — postojeće verzije se ne
                mijenjaju.
              </p>
              <label className="label" htmlFor="sal-employee">
                Zaposleni
              </label>
              <select
                id="sal-employee"
                className="input"
                value={sEmployeeId}
                onChange={(e) => setSEmployeeId(e.target.value)}
              >
                <option value="">Odaberite zaposlenog…</option>
                {employees.map((r) => (
                  <option key={r.employeeId} value={r.employeeId}>
                    {r.employeeNumber} · {r.name}
                  </option>
                ))}
              </select>
              <label className="label" htmlFor="sal-amount">
                Neto iznos
              </label>
              <input
                id="sal-amount"
                className="input mono"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={sAmount}
                onChange={(e) => setSAmount(e.target.value)}
              />
              <label className="label" htmlFor="sal-from">
                Važi od
              </label>
              <input
                id="sal-from"
                className="input"
                type="date"
                value={sValidFrom}
                onChange={(e) => setSValidFrom(e.target.value)}
              />
              <label className="label" htmlFor="sal-note">
                Napomena
              </label>
              <input
                id="sal-note"
                className="input"
                value={sNote}
                maxLength={400}
                placeholder="neobavezno"
                onChange={(e) => setSNote(e.target.value)}
              />
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !salaryFormComplete}
                >
                  Pregledaj i dodaj verziju
                </button>
                {!salaryFormComplete ? (
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    Odaberite zaposlenog, unesite iznos veći od nule i datum važenja.
                  </span>
                ) : null}
              </div>
            </form>
          ) : null}
        </>
      ) : null}

      {/* ------------------------------------------------------- dialogs */}
      {confirmCompute ? (
        <ConfirmDialog
          open
          title={`Obračun plata · ${periodLabel}`}
          consequence="Preračunava nacrt iz šihtarice, važećih plata i korekcija; potvrđen obračun se ne mijenja."
          confirmLabel="Obračunaj"
          busy={busy}
          onCancel={() => setConfirmCompute(false)}
          onConfirm={() =>
            void run(async () => {
              const r = await api<RunView>('POST', '/api/v1/payroll/runs/compute', {
                year,
                month,
              });
              setRunView(r);
              setConfirmCompute(false);
            }, `Nacrt obračuna za ${periodLabel} je preračunat.`)
          }
        >
          <Fact label="Mjesec">{periodLabel}</Fact>
          <Fact label="Trenutni status">{RUN_STATUS_LABELS[runStatus]}</Fact>
          <Fact label="Šihtarica">{attendanceLocked ? 'zaključena' : 'otvorena'}</Fact>
        </ConfirmDialog>
      ) : null}

      {confirmRun && runView ? (
        <ConfirmDialog
          open
          title={`Potvrda obračuna · ${periodLabel}`}
          consequence="Potvrđen obračun je nepromjenjiv snimak; šihtarica tog mjeseca se više ne može otključati."
          confirmLabel="Potvrdi obračun"
          busy={busy}
          onCancel={() => setConfirmRun(false)}
          onConfirm={() =>
            void run(async () => {
              await api('POST', '/api/v1/payroll/runs/confirm', { year, month });
              setConfirmRun(false);
            }, `Obračun za ${periodLabel} je potvrđen.`)
          }
        >
          <Fact label="Mjesec">{periodLabel}</Fact>
          <Fact label="Broj zaposlenih (vidljivo)">
            <span className="mono">{runView.lines.length}</span>
            {(runView.lockedLinesIncluded ?? 0) > 0
              ? ` (uklj. ${runView.lockedLinesIncluded} pod zaključavanjem)`
              : ''}
          </Fact>
          <Fact label="Fond dana">
            <span className="mono">{runView.fundDays ?? '—'}</span>
          </Fact>
          <Fact label="Ukupno (vidljivo)">
            <Money amount={runView.visibleTotal} currency={runView.currency} />
          </Fact>
        </ConfirmDialog>
      ) : null}

      {confirmAdjust ? (
        <ConfirmDialog
          open
          title={hasPending ? 'Ponovno slanje korekcije' : 'Evidentiranje korekcije'}
          consequence={
            hasPending
              ? 'Prethodno slanje nije potvrđeno — šalje se RANIJE PREDANI sadržaj pod istim ključem (bez duplikata).'
              : 'Korekcija se evidentira za odabrani mjesec i ulazi u nacrt pri sljedećem obračunu; za potvrđen obračun je odbijena.'
          }
          confirmLabel="Evidentiraj"
          busy={busy}
          onCancel={() => setConfirmAdjust(false)}
          onConfirm={() =>
            void run(async () => {
              if (!pendingAdjRef.current) {
                pendingAdjRef.current = { key: crypto.randomUUID(), body: currentAdjBody() };
                setHasPending(true);
              }
              const pending = pendingAdjRef.current;
              let r: { id: string; replay: boolean };
              try {
                r = await api<{ id: string; replay: boolean }>(
                  'POST',
                  '/api/v1/payroll/adjustments',
                  { ...pending.body, requestKey: pending.key },
                );
              } catch (e) {
                // Discard key+content only on a business-unambiguous
                // rejection; CONFLICT, 401/403, 5xx and network errors
                // keep them for a safe retry under the same key.
                if (
                  e instanceof ApiRequestError &&
                  submissionResolvedByError(e.status, e.body.code)
                ) {
                  pendingAdjRef.current = null;
                  setHasPending(false);
                }
                throw e;
              }
              pendingAdjRef.current = null;
              setHasPending(false);
              setAAmount('');
              setAReason('');
              setConfirmAdjust(false);
              setNotice(
                r.replay
                  ? 'Korekcija je već bila evidentirana — ponovljeno slanje nije napravilo duplikat.'
                  : `${KIND_LABELS[pending.body.kind]} evidentiran za ${employeeLabel(pending.body.employeeId)} (${MONTHS[pending.body.month - 1]} ${pending.body.year}.).`,
              );
            }, null)
          }
        >
          <Fact label="Mjesec">
            {MONTHS[dialogAdj.month - 1]} {dialogAdj.year}.
          </Fact>
          <Fact label="Zaposleni">{employeeLabel(dialogAdj.employeeId)}</Fact>
          <Fact label="Vrsta">{KIND_LABELS[dialogAdj.kind]}</Fact>
          <Fact label="Iznos">
            <span className="mono">{dialogAdj.amount}</span>
          </Fact>
          <Fact label="Razlog">{dialogAdj.reason}</Fact>
        </ConfirmDialog>
      ) : null}

      {confirmSalary ? (
        <ConfirmDialog
          open
          title="Nova verzija plate"
          consequence="Dodaje novu verziju plate od navedenog datuma — postojeće verzije se ne mijenjaju; verzija s istim datumom važenja se odbija."
          confirmLabel="Dodaj verziju"
          busy={busy}
          onCancel={() => setConfirmSalary(false)}
          onConfirm={() =>
            void run(
              async () => {
                await api('POST', '/api/v1/payroll/salaries', {
                  employeeId: sEmployeeId,
                  netAmount: Number(sAmount),
                  validFrom: sValidFrom,
                  ...(sNote.trim() ? { note: sNote.trim() } : {}),
                });
                setSAmount('');
                setSNote('');
                setConfirmSalary(false);
              },
              `Nova verzija plate evidentirana za ${employeeLabel(sEmployeeId)}.`,
            )
          }
        >
          <Fact label="Zaposleni">{employeeLabel(sEmployeeId)}</Fact>
          <Fact label="Neto iznos">
            <span className="mono">{sAmount}</span>
          </Fact>
          <Fact label="Važi od">
            <span className="mono">{sValidFrom}</span>
          </Fact>
          <Fact label="Napomena">{sNote.trim() || '—'}</Fact>
        </ConfirmDialog>
      ) : null}

      {lockTarget ? (
        <ConfirmDialog
          open
          title={
            lockTarget.salaryLocked
              ? 'Ukidanje upravljačkog zaključavanja'
              : 'Upravljačko zaključavanje plate'
          }
          consequence={
            lockTarget.salaryLocked
              ? 'Platu ovog zaposlenog ponovo vidi i mijenja cijeli salary krug.'
              : 'Platu ovog zaposlenog vidi i mijenja samo upravljački nivo; ostali ga ne vide u platama ni u obračunu.'
          }
          confirmLabel={lockTarget.salaryLocked ? 'Otključaj' : 'Zaključaj'}
          busy={busy}
          onCancel={() => setLockTarget(null)}
          onConfirm={() =>
            void run(
              async () => {
                await api('POST', '/api/v1/payroll/salary-lock', {
                  employeeId: lockTarget.employeeId,
                  locked: !lockTarget.salaryLocked,
                });
                setLockTarget(null);
              },
              lockTarget.salaryLocked
                ? `Upravljačko zaključavanje ukinuto: ${lockTarget.name}.`
                : `Plata zaključena na upravljački nivo: ${lockTarget.name}.`,
            )
          }
        >
          <Fact label="Zaposleni">
            <span className="mono">{lockTarget.employeeNumber}</span> · {lockTarget.name}
          </Fact>
          <Fact label="Trenutno">{lockTarget.salaryLocked ? 'zaključano' : 'otključano'}</Fact>
        </ConfirmDialog>
      ) : null}
    </main>
  );
}

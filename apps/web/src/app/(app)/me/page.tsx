'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import { money } from '../../../components/made-to-measure';
import { ApiRequestError, api, errorText } from '../../../lib/api';
import { downloadDocument } from '../../../lib/download';
import { useApp } from '../app-shell';
import styles from './me.module.css';

/**
 * Moj HR (HCM-018, Sprint 253): employee self-service. Every request works
 * on the employee linked to the signed-in user — the UI never sends an
 * employee id. Presentation only: leave rules, payslip switch, document
 * ownership and permissions are decided on the server.
 */

interface Profile {
  employeeNumber: string;
  name: string;
  email: string | null;
  title: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  hiredAt: string | null;
  qualificationLevel: string | null;
  payslipsEnabled: boolean;
}

interface AttendanceDay {
  day: string;
  statusKey: string;
  label: string;
  countsAsWorked: boolean;
}

interface AttendanceMonth {
  year: number;
  month: number;
  locked: boolean;
  workedDays: number;
  days: AttendanceDay[];
}

type LeaveStatus = 'REQUESTED' | 'GRANTED' | 'REJECTED';
type LeaveType = 'GODISNJI' | 'BOLOVANJE' | 'PLACENO' | 'NEPLACENO' | 'OSTALO';

interface LeaveRow {
  from: string;
  to: string;
  type: string | null;
  status: LeaveStatus;
  requestedAt: string;
}

interface ContractRow {
  id: string;
  contractNumber: string;
  contractType: string;
  startDate: string;
  endDate: string | null;
  position: string | null;
  status: string;
  content: string | null;
}

interface DocumentRow {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

interface PayslipRef {
  year: number;
  month: number;
  currency: string;
}

interface Payslip {
  title: string;
  employeeNumber: string;
  employeeName: string;
  currency: string;
  baseNet: string;
  fundDays: number;
  workedDays: number;
  earned: string;
  adjustments: Array<{ kind: string; amount: string; reason: string | null }>;
  bonuses: string;
  deductions: string;
  netTotal: string;
}

type TabKey = 'pregled' | 'sihtarica' | 'odsustva' | 'ugovori' | 'dokumenti' | 'listici';

const TAB_LABEL: Record<TabKey, string> = {
  pregled: 'Pregled',
  sihtarica: 'Šihtarica',
  odsustva: 'Odsustva',
  ugovori: 'Ugovori',
  dokumenti: 'Dokumenti',
  listici: 'Listići',
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

const WEEKDAYS = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'];

const LEAVE_TYPES: Array<{ key: LeaveType; label: string }> = [
  { key: 'GODISNJI', label: 'Godišnji odmor' },
  { key: 'BOLOVANJE', label: 'Bolovanje' },
  { key: 'PLACENO', label: 'Plaćeno odsustvo' },
  { key: 'NEPLACENO', label: 'Neplaćeno odsustvo' },
  { key: 'OSTALO', label: 'Ostalo' },
];

const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  REQUESTED: 'Na odobravanju',
  GRANTED: 'Odobreno',
  REJECTED: 'Odbijeno',
};

const LEAVE_STATUS_BADGE: Record<LeaveStatus, string> = {
  REQUESTED: 'badge-warn',
  GRANTED: 'badge-ok',
  REJECTED: 'badge-danger',
};

const CONTRACT_TYPE_LABEL: Record<string, string> = {
  INDEFINITE: 'Neodređeno',
  FIXED_TERM: 'Određeno',
};

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  ISSUED: 'Važeći',
  TERMINATED: 'Raskinut',
};

const ADJUSTMENT_LABEL: Record<string, string> = {
  BONUS: 'Bonus',
  DEDUCTION: 'Odbitak',
};

/* ------------------------------------------------------------- formatting */

/** YYYY-MM-DD → d.m.yyyy (explicit; headless browsers lack bs-BA data). */
function fmtDay(value: string | null | undefined): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${Number(m[3])}.${Number(m[2])}.${m[1]}`;
}

/** ISO timestamp → local d.m.yyyy. */
function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function leaveTypeLabel(type: string | null): string {
  if (!type) return 'Odsustvo';
  return LEAVE_TYPES.find((t) => t.key === type)?.label ?? type;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isForbidden(e: unknown): boolean {
  return e instanceof ApiRequestError && e.status === 403;
}

/* ------------------------------------------------------------------- page */

export default function MyHrPage() {
  const { can } = useApp();
  const allowed = can('hcm.self');

  const [profile, setProfile] = useState<Profile | null>(null);
  const [notLinked, setNotLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('pregled');
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});

  const loadProfile = useCallback(() => {
    if (!allowed) return;
    setError(null);
    setNotLinked(false);
    setProfile(null);
    api<Profile>('GET', '/api/v1/hcm/me')
      .then(setProfile)
      .catch((e: unknown) => {
        if (e instanceof ApiRequestError && e.status === 404) setNotLinked(true);
        else setError(errorText(e));
      });
  }, [allowed]);

  useEffect(loadProfile, [loadProfile]);

  const tabs: TabKey[] = [
    'pregled',
    'sihtarica',
    'odsustva',
    'ugovori',
    'dokumenti',
    ...(profile?.payslipsEnabled ? (['listici'] as TabKey[]) : []),
  ];

  // A shared link such as /me#odsustva opens that tab directly.
  useEffect(() => {
    const hash = window.location.hash.slice(1) as TabKey;
    if (hash in TAB_LABEL) setTab(hash);
  }, []);

  const select = (key: TabKey, focus = false) => {
    setTab(key);
    if (focus) tabRefs.current[key]?.focus();
    try {
      window.history.replaceState(null, '', `#${key}`);
    } catch {
      // Hash is a convenience only.
    }
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    const key = tabs[next];
    if (key) select(key, true);
  };

  const active: TabKey = tabs.includes(tab) ? tab : 'pregled';

  return (
    <main className="page">
      <h1>Moj HR</h1>
      <p className="page-sub">
        Vaši podaci, šihtarica, odsustva, ugovori i dokumenti na jednom mjestu. Vidite samo svoje
        podatke.
      </p>

      {!allowed ? (
        <EmptyState text="Vaša uloga nema pristup ekranu Moj HR (dozvola hcm.self) — obratite se administratoru." />
      ) : notLinked ? (
        <div className="card">
          <EmptyState text="Vaš korisnički nalog nije povezan s radnikom — obratite se HR-u." />
          <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>
            HR povezuje nalog na ekranu Zaposleni → profil zaposlenog → Korisnički nalog (Moj HR).
          </p>
        </div>
      ) : error ? (
        <div className="card">
          <ErrorState text={error} />
          <button type="button" className={`btn ${styles.touch}`} onClick={loadProfile}>
            Pokušaj ponovo
          </button>
        </div>
      ) : profile === null ? (
        <LoadingState text="Učitavanje vaših podataka…" />
      ) : (
        <>
          <section className="card" aria-label="Zaposleni">
            <div className={styles.hero}>
              <div style={{ minWidth: 0 }}>
                <h2 className={styles.heroName}>{profile.name}</h2>
                <div className={styles.heroMeta}>
                  <span className="mono">{profile.employeeNumber}</span>
                  {profile.title ? <span>· {profile.title}</span> : null}
                </div>
              </div>
              <span
                className={`badge ${profile.status === 'ACTIVE' ? 'badge-ok' : 'badge-danger'}`}
              >
                {profile.status === 'ACTIVE' ? 'Aktivan' : 'Neaktivan'}
              </span>
            </div>
          </section>

          <div className={styles.tabs} role="tablist" aria-label="Moj HR">
            {tabs.map((key, index) => (
              <button
                key={key}
                ref={(el) => {
                  tabRefs.current[key] = el;
                }}
                type="button"
                role="tab"
                id={`me-tab-${key}`}
                aria-selected={active === key}
                aria-controls={`me-panel-${key}`}
                tabIndex={active === key ? 0 : -1}
                className={`btn ${active === key ? 'btn-primary' : ''} ${styles.tab}`}
                onClick={() => select(key)}
                onKeyDown={(e) => onTabKey(e, index)}
              >
                {TAB_LABEL[key]}
              </button>
            ))}
          </div>

          <section
            className="card"
            role="tabpanel"
            id={`me-panel-${active}`}
            aria-labelledby={`me-tab-${active}`}
          >
            {active === 'pregled' ? (
              <OverviewTab profile={profile} onGo={select} />
            ) : active === 'sihtarica' ? (
              <AttendanceTab />
            ) : active === 'odsustva' ? (
              <LeaveTab />
            ) : active === 'ugovori' ? (
              <ContractsTab />
            ) : active === 'dokumenti' ? (
              <DocumentsTab />
            ) : (
              <PayslipsTab />
            )}
          </section>
        </>
      )}
    </main>
  );
}

/* --------------------------------------------------------------- Pregled */

function OverviewTab({ profile, onGo }: { profile: Profile; onGo: (key: TabKey) => void }) {
  return (
    <>
      <h2 style={{ marginTop: 0 }}>Moji podaci</h2>
      <div className="fact">
        <span>Broj radnika</span>
        <span className="mono">{profile.employeeNumber}</span>
      </div>
      <div className="fact">
        <span>Ime i prezime</span>
        <span>{profile.name}</span>
      </div>
      <div className="fact">
        <span>Pozicija</span>
        <span>{profile.title ?? '—'}</span>
      </div>
      <div className="fact">
        <span>E-mail</span>
        <span style={{ overflowWrap: 'anywhere' }}>{profile.email ?? '—'}</span>
      </div>
      <div className="fact">
        <span>Datum zaposlenja</span>
        <span>{fmtDay(profile.hiredAt)}</span>
      </div>
      <div className="fact">
        <span>Stručna sprema</span>
        <span>{profile.qualificationLevel ?? '—'}</span>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>
        Ako je neki podatak netačan, javite se HR-u — ispravke unosi HR.
      </p>
      <div className="row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className={`btn btn-primary ${styles.touch}`}
          onClick={() => onGo('odsustva')}
        >
          Zatraži odsustvo
        </button>
        <button type="button" className={`btn ${styles.touch}`} onClick={() => onGo('sihtarica')}>
          Pogledaj šihtaricu
        </button>
        {profile.payslipsEnabled ? (
          <button type="button" className={`btn ${styles.touch}`} onClick={() => onGo('listici')}>
            Platni listići
          </button>
        ) : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------- Šihtarica */

function AttendanceTab() {
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [data, setData] = useState<AttendanceMonth | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setData(null);
    setError(null);
    api<AttendanceMonth>(
      'GET',
      `/api/v1/hcm/me/attendance?year=${period.year}&month=${period.month}`,
    )
      .then(setData)
      .catch((e: unknown) => setError(errorText(e)));
  }, [period]);

  useEffect(load, [load]);

  const shift = (delta: number) =>
    setPeriod((p) => {
      const m = p.month - 1 + delta;
      return { year: p.year + Math.floor(m / 12), month: (((m % 12) + 12) % 12) + 1 };
    });

  const daysInMonth = new Date(period.year, period.month, 0).getDate();
  const leading = (new Date(period.year, period.month - 1, 1).getDay() + 6) % 7;
  const byDay = new Map((data?.days ?? []).map((d) => [d.day, d]));
  const today = todayYmd();
  const monthName = `${MONTHS[period.month - 1]} ${period.year}.`;

  const totals = new Map<string, number>();
  for (const d of data?.days ?? []) totals.set(d.label, (totals.get(d.label) ?? 0) + 1);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.monthNav}>
          <button
            type="button"
            className={`btn ${styles.touch}`}
            aria-label="Prethodni mjesec"
            onClick={() => shift(-1)}
          >
            ←
          </button>
          <span className={styles.monthLabel} aria-live="polite">
            {monthName}
          </span>
          <button
            type="button"
            className={`btn ${styles.touch}`}
            aria-label="Sljedeći mjesec"
            onClick={() => shift(1)}
          >
            →
          </button>
        </div>
        {data ? (
          <div className="row">
            <span className="badge badge-ok">Radnih dana: {data.workedDays}</span>
            {data.locked ? (
              <span className="badge badge-info" title="HR je zaključio ovaj mjesec">
                Mjesec zaključen
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <>
          <ErrorState text={error} />
          <button type="button" className={`btn ${styles.touch}`} onClick={load}>
            Pokušaj ponovo
          </button>
        </>
      ) : data === null ? (
        <LoadingState text="Učitavanje šihtarice…" />
      ) : (
        <>
          {data.days.length === 0 ? (
            <EmptyState text={`U šihtarici za ovaj mjesec (${monthName}) još nema unosa.`} />
          ) : null}
          <div className={styles.calendar} aria-hidden>
            {WEEKDAYS.map((w) => (
              <div key={w} className={styles.weekday}>
                {w}
              </div>
            ))}
          </div>
          <ol className={styles.calendar} aria-label={`Šihtarica — ${monthName}`}>
            {Array.from({ length: leading }, (_, i) => (
              <li key={`blank-${i}`} className={`${styles.cell} ${styles.cellBlank}`} aria-hidden />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const ymd = `${period.year}-${pad(period.month)}-${pad(i + 1)}`;
              const entry = byDay.get(ymd);
              const cls = [
                styles.cell,
                entry ? (entry.countsAsWorked ? styles.cellWorked : styles.cellOther) : '',
                ymd === today ? styles.cellToday : '',
              ].join(' ');
              return (
                <li
                  key={ymd}
                  className={cls}
                  aria-label={`${fmtDay(ymd)}: ${entry ? entry.label : 'nema unosa'}`}
                  title={entry?.label}
                >
                  <span className={styles.cellNo} aria-hidden>
                    {i + 1}
                  </span>
                  {entry ? (
                    <span className={styles.cellLabel} aria-hidden>
                      {entry.label}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {totals.size > 0 ? (
            <div className={styles.summary} aria-label="Zbir po statusu">
              {[...totals.entries()].map(([label, count]) => (
                <span key={label} className="badge">
                  {label}: {count}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------- Odsustva */

function LeaveTab() {
  const [rows, setRows] = useState<LeaveRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState<LeaveType>('GODISNJI');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<{ leave: LeaveRow[] }>('GET', '/api/v1/hcm/me/leave')
      .then((r) => setRows(r.leave))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(load, [load]);

  // UX only — the server validates the period again.
  const blocked =
    !from || !to ? 'Unesite datum od i do.' : to < from ? 'Datum „do" je prije datuma „od".' : null;

  async function submit() {
    if (blocked || busy) return;
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      const r = await api<{ from: string; to: string; status: LeaveStatus; duplicate: boolean }>(
        'POST',
        '/api/v1/hcm/me/leave',
        { from, to, type },
      );
      setNotice(
        r.duplicate
          ? `Zahtjev za period ${fmtDay(r.from)} – ${fmtDay(r.to)} već postoji (${LEAVE_STATUS_LABEL[r.status] ?? r.status}) — novi nije kreiran.`
          : `Zahtjev za period ${fmtDay(r.from)} – ${fmtDay(r.to)} je poslat na odobravanje.`,
      );
      setFrom('');
      setTo('');
      load();
    } catch (e: unknown) {
      setFormError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Zatraži odsustvo</h2>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className={styles.field}>
          <label className="label" htmlFor="me-leave-from">
            Od
          </label>
          <input
            id="me-leave-from"
            className="input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </div>
        <div className={styles.field}>
          <label className="label" htmlFor="me-leave-to">
            Do
          </label>
          <input
            id="me-leave-to"
            className="input"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </div>
        <div className={styles.field}>
          <label className="label" htmlFor="me-leave-type">
            Vrsta
          </label>
          <select
            id="me-leave-type"
            className="select"
            value={type}
            onChange={(e) => setType(e.target.value as LeaveType)}
          >
            {LEAVE_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <p className={`muted ${styles.wide}`}>
          Razlog (npr. zdravstveni) ne upisujte ovdje — dokumentaciju predajte HR-u.
        </p>
        <div className={`${styles.wide} row`}>
          <button
            type="submit"
            className={`btn btn-primary ${styles.touch}`}
            disabled={busy || blocked !== null}
            aria-describedby={blocked ? 'me-leave-blocked' : undefined}
          >
            {busy ? 'Šaljem…' : 'Pošalji zahtjev'}
          </button>
          {blocked && (from || to) ? (
            <span id="me-leave-blocked" className="muted" style={{ fontSize: 13 }}>
              {blocked}
            </span>
          ) : null}
        </div>
      </form>
      {formError ? <ErrorState text={formError} /> : null}
      {notice ? (
        <div className="alert alert-ok" role="status">
          {notice}
        </div>
      ) : null}

      <h2 style={{ marginTop: 24 }}>Moji zahtjevi</h2>
      {error ? (
        <>
          <ErrorState text={error} />
          <button type="button" className={`btn ${styles.touch}`} onClick={load}>
            Pokušaj ponovo
          </button>
        </>
      ) : rows === null ? (
        <LoadingState text="Učitavanje odsustava…" />
      ) : rows.length === 0 ? (
        <EmptyState text="Još nemate zahtjeva za odsustvo." />
      ) : (
        <ul className={styles.list}>
          {rows.map((r) => (
            <li key={`${r.from}:${r.to}:${r.requestedAt}`} className={styles.item}>
              <div className={styles.itemMain}>
                <div className={styles.itemTitle}>
                  {fmtDay(r.from)} – {fmtDay(r.to)}
                </div>
                <div className={styles.itemSub}>
                  {leaveTypeLabel(r.type)} · zatraženo {fmtStamp(r.requestedAt)}
                </div>
              </div>
              <span className={`badge ${LEAVE_STATUS_BADGE[r.status] ?? ''}`}>
                {LEAVE_STATUS_LABEL[r.status] ?? r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* --------------------------------------------------------------- Ugovori */

function ContractsTab() {
  const [rows, setRows] = useState<ContractRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<{ contracts: ContractRow[] }>('GET', '/api/v1/hcm/me/contracts')
      .then((r) => setRows(r.contracts))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(load, [load]);

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Moji ugovori</h2>
      {error ? (
        <>
          <ErrorState text={error} />
          <button type="button" className={`btn ${styles.touch}`} onClick={load}>
            Pokušaj ponovo
          </button>
        </>
      ) : rows === null ? (
        <LoadingState text="Učitavanje ugovora…" />
      ) : rows.length === 0 ? (
        <EmptyState text="Za vas još nema evidentiranih ugovora." />
      ) : (
        <ul className={styles.list}>
          {rows.map((c) => {
            const expanded = open === c.id;
            return (
              <li key={c.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <div className={styles.itemTitle}>
                    <span className="mono">{c.contractNumber}</span> ·{' '}
                    {CONTRACT_TYPE_LABEL[c.contractType] ?? c.contractType}
                  </div>
                  <div className={styles.itemSub}>
                    {fmtDay(c.startDate)} – {c.endDate ? fmtDay(c.endDate) : 'neodređeno'}
                    {c.position ? ` · ${c.position}` : ''}
                  </div>
                </div>
                <div className="row">
                  <span className={`badge ${c.status === 'ISSUED' ? 'badge-ok' : 'badge-danger'}`}>
                    {CONTRACT_STATUS_LABEL[c.status] ?? c.status}
                  </span>
                  {c.content ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      aria-expanded={expanded}
                      aria-controls={`me-contract-${c.id}`}
                      onClick={() => setOpen(expanded ? null : c.id)}
                    >
                      {expanded ? 'Sakrij tekst' : 'Prikaži tekst'}
                    </button>
                  ) : (
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      Bez teksta ugovora
                    </span>
                  )}
                </div>
                {expanded && c.content ? (
                  <pre id={`me-contract-${c.id}`} className={styles.content}>
                    {c.content}
                  </pre>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* ------------------------------------------------------------- Dokumenti */

function DocumentsTab() {
  const [rows, setRows] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<{ documents: DocumentRow[] }>('GET', '/api/v1/hcm/me/documents')
      .then((r) => setRows(r.documents))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(load, [load]);

  async function download(id: string) {
    setDownloading(id);
    setDownloadError(null);
    try {
      await downloadDocument(`/api/v1/hcm/me/documents/${id}`);
    } catch (e: unknown) {
      setDownloadError(errorText(e));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Moji dokumenti</h2>
      {downloadError ? <ErrorState text={downloadError} /> : null}
      {error ? (
        <>
          <ErrorState text={error} />
          <button type="button" className={`btn ${styles.touch}`} onClick={load}>
            Pokušaj ponovo
          </button>
        </>
      ) : rows === null ? (
        <LoadingState text="Učitavanje dokumenata…" />
      ) : rows.length === 0 ? (
        <EmptyState text="HR vam još nije dodijelio nijedan dokument." />
      ) : (
        <ul className={styles.list}>
          {rows.map((d) => (
            <li key={d.id} className={styles.item}>
              <div className={styles.itemMain}>
                <div className={styles.itemTitle}>{d.fileName}</div>
                <div className={styles.itemSub}>
                  {fmtSize(d.sizeBytes)} · dodano {fmtStamp(d.createdAt)}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                disabled={downloading !== null}
                aria-label={`Preuzmi ${d.fileName}`}
                onClick={() => void download(d.id)}
              >
                {downloading === d.id ? 'Preuzimam…' : 'Preuzmi'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* --------------------------------------------------------------- Listići */

function PayslipsTab() {
  const [rows, setRows] = useState<PayslipRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [slipError, setSlipError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setDisabled(false);
    api<{ payslips: PayslipRef[] }>('GET', '/api/v1/hcm/me/payslips')
      .then((r) => setRows(r.payslips))
      .catch((e: unknown) => {
        if (isForbidden(e)) setDisabled(true);
        else setError(errorText(e));
      });
  }, []);

  useEffect(load, [load]);

  function open(p: PayslipRef) {
    const key = `${p.year}-${p.month}`;
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    setSlip(null);
    setSlipError(null);
    api<Payslip>('GET', `/api/v1/hcm/me/payslips/${p.year}/${p.month}`)
      .then(setSlip)
      .catch((e: unknown) => setSlipError(errorText(e)));
  }

  if (disabled) {
    return (
      <EmptyState text="Firma nije uključila pregled platnih listića u aplikaciji — listić tražite od računovodstva." />
    );
  }

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Platni listići</h2>
      {error ? (
        <>
          <ErrorState text={error} />
          <button type="button" className={`btn ${styles.touch}`} onClick={load}>
            Pokušaj ponovo
          </button>
        </>
      ) : rows === null ? (
        <LoadingState text="Učitavanje listića…" />
      ) : rows.length === 0 ? (
        <EmptyState text="Još nema potvrđenih obračuna plate za vas." />
      ) : (
        <ul className={styles.list}>
          {rows.map((p) => {
            const key = `${p.year}-${p.month}`;
            const expanded = openKey === key;
            return (
              <li key={key} className={styles.item}>
                <div className={styles.itemMain}>
                  <div className={styles.itemTitle}>
                    {MONTHS[p.month - 1]} {p.year}.
                  </div>
                  <div className={styles.itemSub}>Valuta {p.currency}</div>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${expanded ? 'btn-primary' : ''}`}
                  aria-expanded={expanded}
                  aria-controls={`me-slip-${key}`}
                  onClick={() => open(p)}
                >
                  {expanded ? 'Zatvori' : 'Otvori listić'}
                </button>
                {expanded ? (
                  <div id={`me-slip-${key}`} style={{ flex: '1 1 100%' }}>
                    {slipError ? (
                      <ErrorState text={slipError} />
                    ) : slip === null ? (
                      <LoadingState text="Učitavanje listića…" />
                    ) : (
                      <PayslipCard slip={slip} />
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function PayslipCard({ slip }: { slip: Payslip }) {
  const amt = (v: string) => `${money(v)} ${slip.currency}`;
  return (
    <article className={`card ${styles.payslip}`} style={{ marginBottom: 0 }}>
      <h3 className={styles.payslipTitle}>{slip.title}</h3>
      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        {slip.employeeName} · <span className="mono">{slip.employeeNumber}</span>
      </div>
      <div className="fact">
        <span>Osnovna neto plata</span>
        <span className={styles.amount}>{amt(slip.baseNet)}</span>
      </div>
      <div className="fact">
        <span>Radni dani / fond</span>
        <span className={styles.amount}>
          {slip.workedDays} / {slip.fundDays}
        </span>
      </div>
      <div className="fact">
        <span>Zarađeno</span>
        <span className={styles.amount}>{amt(slip.earned)}</span>
      </div>
      {slip.adjustments.map((a, i) => (
        <div key={i} className="fact">
          <span>
            {ADJUSTMENT_LABEL[a.kind] ?? a.kind}
            {a.reason ? ` — ${a.reason}` : ''}
          </span>
          <span className={styles.amount}>
            {a.kind === 'DEDUCTION' ? '−' : '+'}
            {amt(a.amount)}
          </span>
        </div>
      ))}
      <div className="fact">
        <span>Ukupno bonusi</span>
        <span className={styles.amount}>{amt(slip.bonuses)}</span>
      </div>
      <div className="fact">
        <span>Ukupno odbici</span>
        <span className={styles.amount}>{amt(slip.deductions)}</span>
      </div>
      <div className={styles.total}>
        <span>Za isplatu</span>
        <span className={styles.amount}>{amt(slip.netTotal)}</span>
      </div>
    </article>
  );
}

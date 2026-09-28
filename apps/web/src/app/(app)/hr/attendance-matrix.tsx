'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiRequestError, errorText } from '../../../lib/api';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '../../../components/ui';

/**
 * HCM-015 (Sprint 234) — šihtarica: attendance status matrix per month.
 * Statuses, labels, countsAsWorked, suggestions, period lock and all
 * counts come from the server; this component only renders them and
 * sends commands. Authority is enforced server-side (hcm.read /
 * hcm.manage); the UI merely hides what the caller may not do.
 */

type AttendanceModel = 'BOTH' | 'MATRIX' | 'CLOCK';
type PeriodStatus = 'OPEN' | 'LOCKED';

interface StatusDef {
  key: string;
  label: string;
  countsAsWorked: boolean;
}

interface MatrixCell {
  status: string;
  source: 'MANUAL' | 'CLOCK' | 'LEAVE';
  version: number;
  note: string | null;
}

interface Suggestion {
  status: string;
  source: 'CLOCK' | 'LEAVE';
}

interface MatrixEmployee {
  id: string;
  employeeNumber: string;
  name: string;
  cells: Record<string, MatrixCell | undefined>;
  suggestions: Record<string, Suggestion | undefined>;
}

interface MatrixView {
  year: number;
  month: number;
  days: string[];
  model: AttendanceModel;
  statuses: StatusDef[];
  periodStatus: PeriodStatus;
  employees: MatrixEmployee[];
}

interface DigestRow {
  employeeId: string;
  employeeNumber: string;
  name: string;
  counts: Record<string, number | undefined>;
  workedDays: number;
  recordedDays: number;
  unrecordedDays: number;
  clockHours: string;
}

interface DigestView {
  periodStatus: PeriodStatus;
  statuses: StatusDef[];
  rows: DigestRow[];
  totals: { workedDays: number; clockHours: string };
}

interface ChangeView {
  at: string;
  actorId: string | null;
  employeeId: string;
  employeeNumber: string | null;
  employeeName: string | null;
  day: string;
  from: string | null;
  to: string | null;
  source: string | null;
  note: string | null;
}

/** Digest table row: an employee row, or the server-provided totals. */
type DigestTableRow = (DigestRow & { total?: false }) | { total: true; employeeId: string };

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

const WEEKDAYS = ['Ned', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub'];

const MODEL_LABEL: Record<AttendanceModel, string> = {
  BOTH: 'Šihtarica + clock evidencija',
  MATRIX: 'Samo šihtarica',
  CLOCK: 'Samo clock evidencija',
};

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: 'Ručni unos',
  CLOCK: 'Clock evidencija',
  LEAVE: 'Odobreno odsustvo',
};

const SOURCE_TITLE: Record<string, string> = {
  CLOCK: 'iz clock evidencije',
  LEAVE: 'iz odobrenog odsustva',
};

// Display-only colour rotation; countsAsWorked (from the server) → ok.
const OTHER_BADGES = ['badge-info', 'badge-warn', 'badge-danger', 'badge-accent', ''];

/** 1–3 character display abbreviation of a server label (display only). */
function abbreviate(s: StatusDef): string {
  const words = s.label.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words
      .slice(0, 3)
      .map((w) => w[0]!.toUpperCase())
      .join('');
  }
  const w = words[0] ?? s.key;
  return w.slice(0, 2).charAt(0).toUpperCase() + w.slice(1, 2).toLowerCase();
}

function buildAbbreviations(statuses: StatusDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const s of statuses) {
    let a = abbreviate(s);
    if (used.has(a)) a = s.key.slice(0, 3);
    used.add(a);
    out[s.key] = a;
  }
  return out;
}

function badgeFor(statuses: StatusDef[], key: string): string {
  const idx = statuses.findIndex((s) => s.key === key);
  if (idx < 0) return '';
  if (statuses[idx]!.countsAsWorked) return 'badge-ok';
  const others = statuses.slice(0, idx).filter((s) => !s.countsAsWorked).length;
  return OTHER_BADGES[others % OTHER_BADGES.length]!;
}

function weekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

function formatDay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}.${m}.${y}.`;
}

const cellBadge: CSSProperties = {
  padding: '2px 6px',
  gap: 3,
  fontSize: 11,
  minWidth: 34,
  justifyContent: 'center',
};

const stickyCol: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  background: 'var(--color-surface)',
  borderRight: '1px solid var(--color-border)',
  minWidth: 150,
  maxWidth: 190,
  padding: '6px 8px',
};

export function AttendanceMatrix({ canManage }: { canManage: boolean }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [matrix, setMatrix] = useState<MatrixView | null>(null);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [digest, setDigest] = useState<DigestView | null>(null);
  const [digestError, setDigestError] = useState<string | null>(null);
  const [changes, setChanges] = useState<ChangeView[] | null>(null);
  const [changesError, setChangesError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<{ employee: MatrixEmployee; day: string } | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editNote, setEditNote] = useState('');
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');

  const load = useCallback(() => {
    const q = `year=${year}&month=${month}`;
    setMatrixError(null);
    setDigestError(null);
    setChangesError(null);
    api<MatrixView>('GET', `/api/v1/workforce/attendance/matrix?${q}`)
      .then((r) => setMatrix(r))
      .catch((e: unknown) => setMatrixError(errorText(e)));
    api<DigestView>('GET', `/api/v1/workforce/attendance/digest?${q}`)
      .then((r) => setDigest(r))
      .catch((e: unknown) => setDigestError(errorText(e)));
    if (canManage) {
      api<{ changes: ChangeView[] }>('GET', `/api/v1/workforce/attendance/changes?${q}`)
        .then((r) => setChanges(r.changes))
        .catch((e: unknown) => setChangesError(errorText(e)));
    }
  }, [year, month, canManage]);

  useEffect(load, [load]);

  function changePeriod(nextYear: number, nextMonth: number) {
    setMatrix(null);
    setDigest(null);
    setChanges(null);
    setError(null);
    setNotice(null);
    setYear(nextYear);
    setMonth(nextMonth);
  }

  function shiftMonth(delta: number) {
    const zeroBased = month - 1 + delta;
    changePeriod(year + Math.floor(zeroBased / 12), (((zeroBased % 12) + 12) % 12) + 1);
  }

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const text = await fn();
      if (text) setNotice(text);
    } catch (e: unknown) {
      if (e instanceof ApiRequestError && e.status === 409 && e.body.code === 'CONFLICT') {
        setError(`${e.body.message} Šihtarica je ponovo učitana s aktuelnim podacima.`);
      } else {
        setError(errorText(e));
      }
    } finally {
      setBusy(false);
      load();
    }
  }

  const statuses = matrix?.statuses ?? digest?.statuses ?? [];
  const abbr = buildAbbreviations(statuses);
  const labelOf = (key: string | null) =>
    key === null ? '—' : (statuses.find((s) => s.key === key)?.label ?? key);

  const periodOpen = matrix?.periodStatus === 'OPEN';
  const editable = canManage && matrix !== null && periodOpen && matrix.model !== 'CLOCK';
  const periodLabel = `${MONTHS[month - 1]} ${year}.`;

  function openEditor(employee: MatrixEmployee, day: string) {
    const cell = employee.cells[day];
    setEditing({ employee, day });
    setEditStatus(cell?.status ?? employee.suggestions[day]?.status ?? statuses[0]?.key ?? '');
    setEditNote(cell?.note ?? '');
  }

  function saveDay(statusKey: string | null) {
    if (!editing) return;
    const { employee, day } = editing;
    const cell = employee.cells[day];
    void run(async () => {
      const r = await api<{ changed: boolean }>('POST', '/api/v1/workforce/attendance/day', {
        employeeId: employee.id,
        day,
        statusKey,
        ...(editNote.trim() ? { note: editNote.trim() } : {}),
        expectedVersion: cell?.version ?? 0,
      });
      setEditing(null);
      if (!r.changed) return 'Bez promjene — dan već ima taj status.';
      return statusKey === null ? 'Dan je očišćen.' : 'Status dana je sačuvan.';
    });
  }

  const years = [year - 2, year - 1, year, year + 1].filter((y) => y >= 2000 && y <= 2100);

  // ---------------------------------------------------------- digest table
  const digestRows: DigestTableRow[] = digest
    ? [...digest.rows, { total: true, employeeId: '__total' }]
    : [];
  const digestColumns: Array<Column<DigestTableRow>> = [
    {
      key: 'number',
      header: 'Broj',
      render: (r) => (r.total ? null : <span className="mono">{r.employeeNumber}</span>),
      text: (r) => (r.total ? '' : r.employeeNumber),
    },
    {
      key: 'name',
      header: 'Ime',
      render: (r) => (r.total ? <strong>Ukupno</strong> : r.name),
      text: (r) => (r.total ? '' : r.name),
    },
    ...(digest?.statuses ?? []).map((s): Column<DigestTableRow> => ({
      key: `s-${s.key}`,
      header: abbr[s.key] ?? s.key,
      align: 'right',
      render: (r) =>
        r.total ? (
          <span className="muted">—</span>
        ) : (
          <span className="mono" title={s.label}>
            {r.counts[s.key] ?? 0}
          </span>
        ),
    })),
    {
      key: 'worked',
      header: 'Radni dani',
      align: 'right',
      render: (r) => (
        <span className="mono">
          {r.total ? <strong>{digest?.totals.workedDays ?? 0}</strong> : r.workedDays}
        </span>
      ),
    },
    {
      key: 'unrecorded',
      header: 'Neevidentirano',
      align: 'right',
      render: (r) =>
        r.total ? (
          <span className="muted">—</span>
        ) : (
          <span className={`mono ${r.unrecordedDays > 0 ? 'badge badge-warn' : ''}`}>
            {r.unrecordedDays}
          </span>
        ),
    },
    {
      key: 'hours',
      header: 'Sati (clock)',
      align: 'right',
      render: (r) => (
        <span className="mono">
          {r.total ? <strong>{digest?.totals.clockHours ?? '0.00'}</strong> : r.clockHours}
        </span>
      ),
    },
  ];

  // --------------------------------------------------------- changes table
  const changeColumns: Array<Column<ChangeView>> = [
    {
      key: 'at',
      header: 'Vrijeme',
      render: (c) => <span className="mono">{new Date(c.at).toLocaleString('bs-BA')}</span>,
      text: (c) => c.at,
    },
    {
      key: 'employee',
      header: 'Zaposleni',
      render: (c) => (
        <span>
          {c.employeeNumber ? <span className="mono">{c.employeeNumber} </span> : null}
          {c.employeeName ?? '—'}
        </span>
      ),
      text: (c) => `${c.employeeNumber ?? ''} ${c.employeeName ?? ''}`,
    },
    {
      key: 'day',
      header: 'Dan',
      render: (c) => <span className="mono">{formatDay(c.day)}</span>,
      text: (c) => c.day,
    },
    {
      key: 'change',
      header: 'Staro → novo',
      render: (c) => (
        <span>
          {labelOf(c.from)} → <strong>{labelOf(c.to)}</strong>
        </span>
      ),
      text: (c) => `${labelOf(c.from)} ${labelOf(c.to)}`,
    },
    {
      key: 'source',
      header: 'Izvor',
      render: (c) => (c.source ? (SOURCE_LABEL[c.source] ?? c.source) : '—'),
      text: (c) => (c.source ? (SOURCE_LABEL[c.source] ?? c.source) : ''),
    },
    {
      key: 'note',
      header: 'Napomena',
      render: (c) => c.note ?? <span className="muted">—</span>,
      text: (c) => c.note ?? '',
    },
  ];

  const blockedReason = !canManage
    ? null
    : matrix === null
      ? null
      : !periodOpen
        ? 'Mjesec je zaključen — izmjene i prijedlozi su blokirani.'
        : matrix.model === 'CLOCK'
          ? 'Model evidencije je samo clock — dani se ne unose ručno.'
          : null;

  return (
    <>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="card">
        <div className="spread" style={{ flexWrap: 'wrap' }}>
          <h2 style={{ marginBottom: 0 }}>Šihtarica — {periodLabel}</h2>
          <div className="row">
            {matrix ? (
              <>
                <span className="badge badge-info">{MODEL_LABEL[matrix.model]}</span>
                <span className={`badge ${periodOpen ? 'badge-ok' : 'badge-warn'}`}>
                  {periodOpen ? 'Otvoren' : 'Zaključen'}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-sm"
            aria-label="Prethodni mjesec"
            onClick={() => shiftMonth(-1)}
          >
            ←
          </button>
          <select
            className="select"
            style={{ maxWidth: 150 }}
            aria-label="Mjesec"
            value={month}
            onChange={(e) => changePeriod(year, Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ maxWidth: 110 }}
            aria-label="Godina"
            value={year}
            onChange={(e) => changePeriod(Number(e.target.value), month)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm"
            aria-label="Sljedeći mjesec"
            onClick={() => shiftMonth(1)}
          >
            →
          </button>
        </div>

        {canManage && matrix ? (
          <div className="row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy || blockedReason !== null}
              title={blockedReason ?? undefined}
              onClick={() => setConfirmApply(true)}
            >
              Primijeni prijedloge
            </button>
            {periodOpen ? (
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => setConfirmLock(true)}
              >
                Zaključaj mjesec
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={busy}
                onClick={() => {
                  setUnlockReason('');
                  setConfirmUnlock(true);
                }}
              >
                Otključaj
              </button>
            )}
          </div>
        ) : null}
        {blockedReason ? (
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            {blockedReason}
          </p>
        ) : null}
        {!canManage ? (
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            Prikaz je samo za čitanje — za unos i izmjene potrebna je dozvola hcm.manage.
          </p>
        ) : null}

        <div style={{ marginTop: 14 }}>
          {matrixError ? (
            <ErrorState text={matrixError} />
          ) : matrix === null ? (
            <LoadingState text="Učitavanje šihtarice…" />
          ) : matrix.employees.length === 0 ? (
            <EmptyState text="Nema zaposlenih za prikaz u ovom mjesecu." />
          ) : (
            <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <table
                className="table"
                style={{ width: 'max-content', minWidth: '100%', fontSize: 12.5 }}
              >
                <caption className="muted" style={{ textAlign: 'left', fontSize: 12, padding: 4 }}>
                  Šihtarica za {periodLabel}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" style={{ ...stickyCol, zIndex: 2 }}>
                      Zaposleni
                    </th>
                    {matrix.days.map((d) => {
                      const wd = weekday(d);
                      const weekend = wd === 0 || wd === 6;
                      return (
                        <th
                          key={d}
                          scope="col"
                          style={{
                            textAlign: 'center',
                            padding: '6px 3px',
                            letterSpacing: 0,
                            opacity: weekend ? 0.55 : 1,
                          }}
                        >
                          <div>{Number(d.slice(8, 10))}</div>
                          <div style={{ fontWeight: 500 }}>{WEEKDAYS[wd]}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {matrix.employees.map((emp) => (
                    <tr key={emp.id}>
                      <th scope="row" style={{ ...stickyCol, textAlign: 'left', fontWeight: 500 }}>
                        <div className="mono" style={{ fontSize: 11 }}>
                          {emp.employeeNumber}
                        </div>
                        <div
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {emp.name}
                        </div>
                      </th>
                      {matrix.days.map((d) => {
                        const wd = weekday(d);
                        const weekend = wd === 0 || wd === 6;
                        const cell = emp.cells[d];
                        const suggestion = cell ? undefined : emp.suggestions[d];
                        const shown = cell ?? suggestion;
                        const statusText = cell
                          ? labelOf(cell.status)
                          : suggestion
                            ? `prazno (prijedlog: ${labelOf(suggestion.status)})`
                            : 'prazno';
                        const ariaLabel = `${emp.name}, ${formatDay(d)}, ${statusText}`;
                        const title = cell
                          ? [
                              labelOf(cell.status),
                              SOURCE_TITLE[cell.source],
                              cell.note ? `Napomena: ${cell.note}` : null,
                            ]
                              .filter(Boolean)
                              .join(' — ')
                          : suggestion
                            ? `Prijedlog: ${labelOf(suggestion.status)} (${SOURCE_TITLE[suggestion.source]}) — nije sačuvano`
                            : undefined;
                        const content = shown ? (
                          <span
                            className={`badge ${badgeFor(statuses, shown.status)}`}
                            style={{
                              ...cellBadge,
                              position: 'relative',
                              ...(suggestion
                                ? {
                                    opacity: 0.55,
                                    background: 'transparent',
                                    border: '1px dashed currentColor',
                                  }
                                : {}),
                            }}
                          >
                            {abbr[shown.status] ?? shown.status.slice(0, 3)}
                            {cell && cell.source !== 'MANUAL' ? (
                              <span
                                aria-hidden="true"
                                style={{
                                  position: 'absolute',
                                  top: -2,
                                  right: -2,
                                  width: 6,
                                  height: 6,
                                  borderRadius: 999,
                                  background: 'var(--color-info)',
                                  border: '1px solid var(--color-surface)',
                                }}
                              />
                            ) : null}
                          </span>
                        ) : (
                          <span className="muted" aria-hidden="true">
                            ·
                          </span>
                        );
                        return (
                          <td
                            key={d}
                            style={{
                              textAlign: 'center',
                              padding: '4px 2px',
                              verticalAlign: 'middle',
                              background: weekend
                                ? 'color-mix(in srgb, var(--color-bg-deep) 60%, transparent)'
                                : undefined,
                            }}
                          >
                            {editable ? (
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{
                                  padding: 2,
                                  minWidth: 38,
                                  minHeight: 28,
                                  justifyContent: 'center',
                                  background: 'transparent',
                                  borderColor: 'transparent',
                                  boxShadow: 'none',
                                }}
                                aria-label={ariaLabel}
                                title={title}
                                disabled={busy}
                                onClick={() => openEditor(emp, d)}
                              >
                                {content}
                              </button>
                            ) : (
                              <span role="img" aria-label={ariaLabel} title={title}>
                                {content}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {statuses.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <h3 style={{ marginBottom: 6 }}>Legenda</h3>
            <div className="row" style={{ gap: 8 }}>
              {statuses.map((s) => (
                <span key={s.key} className="row" style={{ gap: 4, fontSize: 12.5 }}>
                  <span className={`badge ${badgeFor(statuses, s.key)}`} style={cellBadge}>
                    {abbr[s.key]}
                  </span>
                  {s.label}
                  {s.countsAsWorked ? (
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      (ulazi u radne dane)
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              Plava tačka: unos iz clock evidencije ili odobrenog odsustva. Isprekidan okvir:
              prijedlog koji još nije sačuvan.
            </p>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="spread" style={{ flexWrap: 'wrap' }}>
          <h2 style={{ marginBottom: 0 }}>Presjek — {periodLabel}</h2>
          <button type="button" className="btn btn-sm" onClick={() => window.print()}>
            Štampaj
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          {digestError ? (
            <ErrorState text={digestError} />
          ) : digest === null ? (
            <LoadingState text="Učitavanje presjeka…" />
          ) : (
            <DataTable
              columns={digestColumns}
              rows={digest.rows.length === 0 ? [] : digestRows}
              rowKey={(r) => r.employeeId}
              pageSize={Math.max(10, digestRows.length)}
              searchPlaceholder="Pretraga zaposlenih…"
              emptyText="Nema podataka za presjek u ovom mjesecu."
            />
          )}
        </div>
      </div>

      {canManage ? (
        <div className="card">
          <h2>Kontrola izmjena — {periodLabel}</h2>
          {changesError ? (
            <ErrorState text={changesError} />
          ) : changes === null ? (
            <LoadingState text="Učitavanje izmjena…" />
          ) : (
            <DataTable
              columns={changeColumns}
              rows={changes}
              rowKey={(c) => `${c.at}-${c.employeeId}-${c.day}`}
              searchPlaceholder="Pretraga izmjena…"
              emptyText="Nema izmjena u ovom mjesecu."
            />
          )}
        </div>
      ) : null}

      {editing ? (
        <DayEditor
          employee={editing.employee}
          day={editing.day}
          statuses={statuses}
          status={editStatus}
          note={editNote}
          busy={busy}
          onStatus={setEditStatus}
          onNote={setEditNote}
          onSave={() => saveDay(editStatus || null)}
          onClear={() => saveDay(null)}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {confirmApply ? (
        <ConfirmDialog
          open
          title="Primjena prijedloga"
          consequence="Popunjava samo PRAZNE dane iz clock evidencije i odobrenih odsustava; postojeći unosi se ne mijenjaju."
          confirmLabel="Primijeni prijedloge"
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              const r = await api<{ applied: number; skipped: number }>(
                'POST',
                '/api/v1/workforce/attendance/apply-suggestions',
                { year, month },
              );
              setConfirmApply(false);
              return `Primijenjeno prijedloga: ${r.applied}, preskočeno: ${r.skipped}.`;
            })
          }
          onCancel={() => setConfirmApply(false)}
        >
          <div className="fact">
            <span>Period</span>
            <span>{periodLabel}</span>
          </div>
        </ConfirmDialog>
      ) : null}

      {confirmLock ? (
        <ConfirmDialog
          open
          title="Zaključavanje mjeseca"
          consequence="Izmjene i prijedlozi za ovaj mjesec postaju blokirani; obračun koristi zaključane podatke."
          confirmLabel="Zaključaj mjesec"
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              await api('POST', '/api/v1/workforce/attendance/lock', { year, month });
              setConfirmLock(false);
              return 'Mjesec je zaključen.';
            })
          }
          onCancel={() => setConfirmLock(false)}
        >
          <div className="fact">
            <span>Period</span>
            <span>{periodLabel}</span>
          </div>
        </ConfirmDialog>
      ) : null}

      {confirmUnlock ? (
        <UnlockDialog
          periodLabel={periodLabel}
          reason={unlockReason}
          busy={busy}
          onReason={setUnlockReason}
          onConfirm={() =>
            void run(async () => {
              await api('POST', '/api/v1/workforce/attendance/unlock', {
                year,
                month,
                reason: unlockReason.trim(),
              });
              setConfirmUnlock(false);
              return 'Mjesec je otključan.';
            })
          }
          onCancel={() => setConfirmUnlock(false)}
        />
      ) : null}
    </>
  );
}

function DayEditor({
  employee,
  day,
  statuses,
  status,
  note,
  busy,
  onStatus,
  onNote,
  onSave,
  onClear,
  onCancel,
}: {
  employee: MatrixEmployee;
  day: string;
  statuses: StatusDef[];
  status: string;
  note: string;
  busy: boolean;
  onStatus: (v: string) => void;
  onNote: (v: string) => void;
  onSave: () => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => selectRef.current?.focus(), []);
  const cell = employee.cells[day];
  const suggestion = employee.suggestions[day];

  return (
    <div
      className="dialog-scrim"
      role="presentation"
      onClick={busy ? undefined : onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) onCancel();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Status dana"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Status dana</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <div className="dialog-body">
            <div className="fact">
              <span>Zaposleni</span>
              <span>{employee.name}</span>
            </div>
            <div className="fact">
              <span>Dan</span>
              <span className="mono">{formatDay(day)}</span>
            </div>
            <div className="fact">
              <span>Trenutno</span>
              <span>
                {cell
                  ? `${statuses.find((s) => s.key === cell.status)?.label ?? cell.status} (${SOURCE_LABEL[cell.source] ?? cell.source})`
                  : 'Prazno'}
              </span>
            </div>
            {!cell && suggestion ? (
              <div className="fact">
                <span>Prijedlog</span>
                <span>
                  {statuses.find((s) => s.key === suggestion.status)?.label ?? suggestion.status} (
                  {SOURCE_TITLE[suggestion.source]})
                </span>
              </div>
            ) : null}
            <label className="label" htmlFor="att-status">
              Status
            </label>
            <select
              id="att-status"
              ref={selectRef}
              className="select"
              value={status}
              onChange={(e) => onStatus(e.target.value)}
            >
              {statuses.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                  {s.countsAsWorked ? ' — ulazi u radne dane' : ''}
                </option>
              ))}
            </select>
            <label className="label" htmlFor="att-note">
              Napomena (opcionalno)
            </label>
            <input
              id="att-note"
              className="input"
              maxLength={300}
              value={note}
              onChange={(e) => onNote(e.target.value)}
            />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              Odustani
            </button>
            <button
              type="button"
              className="btn"
              onClick={onClear}
              disabled={busy || !cell}
              title={!cell ? 'Dan je već prazan' : undefined}
            >
              Očisti
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !status}>
              {busy ? 'Izvršavam…' : 'Sačuvaj'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UnlockDialog({
  periodLabel,
  reason,
  busy,
  onReason,
  onConfirm,
  onCancel,
}: {
  periodLabel: string;
  reason: string;
  busy: boolean;
  onReason: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tooShort = reason.trim().length < 5;
  return (
    <ConfirmDialog
      open
      title="Otključavanje mjeseca"
      consequence="Mjesec ponovo postaje izmjenjiv za unos i prijedloge; otključavanje se evidentira s navedenim razlogom."
      confirmLabel="Otključaj"
      danger
      busy={busy}
      onConfirm={() => {
        if (!tooShort) onConfirm();
      }}
      onCancel={onCancel}
    >
      <div className="fact">
        <span>Period</span>
        <span>{periodLabel}</span>
      </div>
      <label className="label" htmlFor="att-unlock-reason">
        Razlog (najmanje 5 znakova)
      </label>
      <input
        id="att-unlock-reason"
        className="input"
        maxLength={400}
        value={reason}
        onChange={(e) => onReason(e.target.value)}
        required
      />
      {tooShort ? (
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Unesite razlog otključavanja da biste nastavili.
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

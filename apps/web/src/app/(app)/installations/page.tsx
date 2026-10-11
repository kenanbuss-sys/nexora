'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import { ApiRequestError, api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';
import styles from './installations.module.css';

/**
 * Montaže i mjerenja (Sprint 248): dispatcher week board and the crew's
 * field flow for site measurements and installations. Presentation only —
 * slot/crew/vehicle conflicts, state transitions and permissions are all
 * decided by the service domain (server-side); the UI shows the outcome.
 */

type VisitKind = 'MEASUREMENT' | 'INSTALLATION' | 'SERVICE';
type VisitStatus = 'PLANNED' | 'SCHEDULED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

interface VisitView {
  id: string;
  orderNumber: string;
  kind: VisitKind;
  status: VisitStatus;
  accountId: string;
  salesOrderId: string | null;
  quoteId: string | null;
  siteAddress: string | null;
  slotStart: string | null;
  slotEnd: string | null;
  crewEmployeeIds: string[];
  vehicleId: string | null;
  report: string | null;
  customer?: string | null;
  crew?: Array<{ id: string; name: string | null }>;
  vehicle?: { id: string; plate: string; name: string } | null;
}

interface EmployeeOption {
  id: string;
  name: string;
  title?: string | null;
}

interface VehicleOption {
  id: string;
  plate: string;
  name: string;
  active: boolean;
}

interface AccountOption {
  id: string;
  partyName: string;
  accountNumber: string;
}

type KindFilter = '' | 'MEASUREMENT' | 'INSTALLATION';

const KIND_LABEL: Record<VisitKind, string> = {
  MEASUREMENT: 'Mjerenje',
  INSTALLATION: 'Montaža',
  SERVICE: 'Servis',
};

const KIND_BADGE: Record<VisitKind, string> = {
  MEASUREMENT: 'badge-info',
  INSTALLATION: 'badge-accent',
  SERVICE: 'badge-warn',
};

const STATUS_LABEL: Record<VisitStatus, string> = {
  PLANNED: 'Nezakazano',
  SCHEDULED: 'Zakazano',
  IN_PROGRESS: 'U toku',
  DONE: 'Završeno',
  CANCELLED: 'Otkazano',
};

const STATUS_BADGE: Record<VisitStatus, string> = {
  PLANNED: 'badge-warn',
  SCHEDULED: 'badge-info',
  IN_PROGRESS: 'badge-accent',
  DONE: 'badge-ok',
  CANCELLED: 'badge-danger',
};

const DAY_NAMES = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'];

const kindStyle: Record<VisitKind, string | undefined> = {
  MEASUREMENT: styles.kindMEASUREMENT,
  INSTALLATION: styles.kindINSTALLATION,
  SERVICE: styles.kindSERVICE,
};

/* ------------------------------------------------------------ date helpers */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar date as YYYY-MM-DD. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function hm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - offset);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** The week crews work next: on Sunday that is the coming week. */
function workingWeekOf(d: Date): Date {
  const monday = mondayOf(d);
  return d.getDay() === 0 ? addDays(monday, 7) : monday;
}

function shortDate(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function timeRange(v: VisitView): string {
  if (!v.slotStart || !v.slotEnd) return 'Bez termina';
  return `${hm(new Date(v.slotStart))}–${hm(new Date(v.slotEnd))}`;
}

function fullSlot(v: VisitView): string {
  if (!v.slotStart || !v.slotEnd) return 'Bez termina';
  const s = new Date(v.slotStart);
  const dayIdx = (s.getDay() + 6) % 7;
  return `${DAY_NAMES[dayIdx]} ${shortDate(s)}${s.getFullYear()} · ${timeRange(v)}`;
}

function crewNames(v: VisitView): string {
  const names = (v.crew ?? []).map((c) => c.name ?? '—');
  return names.join(', ');
}

/* ------------------------------------------------------------------- page */

export default function InstallationsPage() {
  const { can } = useApp();
  const canRead = can('service.read');
  const canManage = can('service.manage');

  const [weekStart, setWeekStart] = useState<Date>(() => workingWeekOf(new Date()));
  const [kind, setKind] = useState<KindFilter>('');
  const [visits, setVisits] = useState<VisitView[] | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [openVisits, setOpenVisits] = useState<VisitView[] | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [newMeasurement, setNewMeasurement] = useState(false);
  /** Visits learned outside the current lists (deep link, just created). */
  const [extra, setExtra] = useState<Record<string, VisitView>>({});

  const from = ymd(weekStart);
  const to = ymd(addDays(weekStart, 7));

  const loadBoard = useCallback(() => {
    if (!canRead) return;
    setVisits(null);
    setBoardError(null);
    const q = new URLSearchParams({ from, to });
    if (kind) q.set('kind', kind);
    api<{ visits: VisitView[] }>('GET', `/api/v1/service/visits/schedule?${q.toString()}`)
      .then((r) => setVisits(r.visits))
      .catch((e: unknown) => {
        setVisits([]);
        setBoardError(errorText(e));
      });
  }, [canRead, from, to, kind]);

  const loadOpen = useCallback(() => {
    if (!canRead) return;
    setOpenError(null);
    const q = kind ? `?kind=${kind}` : '';
    api<{ visits: VisitView[] }>('GET', `/api/v1/service/visits/open${q}`)
      .then((r) => setOpenVisits(r.visits))
      .catch((e: unknown) => {
        setOpenVisits([]);
        setOpenError(errorText(e));
      });
  }, [canRead, kind]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    loadOpen();
  }, [loadOpen]);

  // Deep link: /installations?visit=<id> opens that visit's schedule dialog.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('visit');
    if (id && /^[0-9a-f-]{36}$/i.test(id)) setScheduleId(id);
  }, []);

  const reloadAll = () => {
    loadBoard();
    loadOpen();
  };

  const findVisit = (id: string | null): VisitView | null => {
    if (!id) return null;
    return (
      (visits ?? []).find((v) => v.id === id) ??
      (openVisits ?? []).find((v) => v.id === id) ??
      extra[id] ??
      null
    );
  };

  const days = useMemo(() => {
    const todayKey = ymd(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const key = ymd(date);
      return {
        key,
        date,
        name: DAY_NAMES[i] ?? '',
        isToday: key === todayKey,
        visits: (visits ?? []).filter((v) => v.slotStart && ymd(new Date(v.slotStart)) === key),
      };
    });
  }, [weekStart, visits]);

  const weekLabel = `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}${addDays(weekStart, 6).getFullYear()}`;

  if (!canRead) {
    return (
      <div className="page">
        <h1>Montaže i mjerenja</h1>
        <ErrorState text="Nemate pravo pregleda terenskih termina (service.read). Zatražite ga od administratora." />
      </div>
    );
  }

  const detail = findVisit(detailId);
  const scheduling = scheduleId ? (findVisit(scheduleId) ?? { id: scheduleId }) : null;

  return (
    <div className="page">
      <div className="spread" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h1>Montaže i mjerenja</h1>
          <p className="page-sub">
            Sedmični raspored mjerenja na terenu i montaža — ekipa, vozilo i termin na jednom
            mjestu.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            className={`btn btn-primary ${styles.touch}`}
            onClick={() => setNewMeasurement(true)}
          >
            + Novo mjerenje
          </button>
        ) : null}
      </div>

      {notice ? (
        <div className="alert alert-ok" role="status">
          {notice}
        </div>
      ) : null}

      <div className={styles.toolbar}>
        <div className={styles.weekNav}>
          <button
            type="button"
            className={`btn ${styles.touch}`}
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            aria-label="Prethodna sedmica"
          >
            ←
          </button>
          <span className={styles.weekLabel} aria-live="polite">
            {weekLabel}
          </span>
          <button
            type="button"
            className={`btn ${styles.touch}`}
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            aria-label="Sljedeća sedmica"
          >
            →
          </button>
          <button
            type="button"
            className={`btn ${styles.touch}`}
            onClick={() => setWeekStart(workingWeekOf(new Date()))}
          >
            Danas
          </button>
        </div>
        <div className="row" role="group" aria-label="Vrsta termina">
          {(
            [
              ['', 'Sve'],
              ['MEASUREMENT', 'Mjerenja'],
              ['INSTALLATION', 'Montaže'],
            ] as Array<[KindFilter, string]>
          ).map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              className="chip"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {boardError ? <ErrorState text={boardError} /> : null}
      {visits === null ? (
        <LoadingState text="Učitavanje rasporeda…" />
      ) : (
        <div className={styles.board}>
          {days.map((day) => (
            <section
              key={day.key}
              className={`${styles.day} ${day.isToday ? styles.today : ''}`}
              aria-label={`${day.name} ${shortDate(day.date)}`}
            >
              <div className={styles.dayHead}>
                <span className={styles.dayName}>{day.name}</span>
                <span className={styles.dayDate}>
                  {shortDate(day.date)}
                  {day.isToday ? (
                    <span className="badge badge-accent" style={{ marginLeft: 6 }}>
                      danas
                    </span>
                  ) : null}
                </span>
              </div>
              {day.visits.length === 0 ? (
                <div className={styles.dayEmpty}>Nema termina</div>
              ) : (
                day.visits.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`${styles.visit} ${kindStyle[v.kind] ?? ''} ${
                      v.status === 'DONE' ? styles.done : ''
                    }`}
                    onClick={() => setDetailId(v.id)}
                    aria-label={`${KIND_LABEL[v.kind]} ${timeRange(v)}, ${v.customer ?? v.orderNumber}, ${STATUS_LABEL[v.status]}`}
                  >
                    <div className={styles.visitHead}>
                      <span className={styles.time}>{timeRange(v)}</span>
                      <span className={`badge ${KIND_BADGE[v.kind]}`}>{KIND_LABEL[v.kind]}</span>
                    </div>
                    <div className={styles.customer}>{v.customer ?? v.orderNumber}</div>
                    {v.siteAddress ? <div className={styles.line}>{v.siteAddress}</div> : null}
                    {crewNames(v) ? <div className={styles.line}>Ekipa: {crewNames(v)}</div> : null}
                    <div className={styles.cardMeta}>
                      {v.vehicle ? (
                        <span className="badge mono" title={v.vehicle.name}>
                          {v.vehicle.plate}
                        </span>
                      ) : null}
                      <span className={`badge ${STATUS_BADGE[v.status]}`}>
                        {STATUS_LABEL[v.status]}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </section>
          ))}
        </div>
      )}
      {visits !== null && visits.length === 0 && !boardError ? (
        <p className="muted" style={{ marginTop: 'var(--sp-3)' }}>
          U ovoj sedmici nema zakazanih termina
          {kind ? ` (${kind === 'MEASUREMENT' ? 'mjerenja' : 'montaže'})` : ''}.
        </p>
      ) : null}

      <div className="card" style={{ marginTop: 'var(--sp-5)' }}>
        <h2>Nezakazano</h2>
        {openError ? <ErrorState text={openError} /> : null}
        {openVisits === null ? <LoadingState /> : null}
        {openVisits !== null && openVisits.length === 0 && !openError ? (
          <EmptyState text="Sve je zakazano — nema otvorenih mjerenja ni montaža bez termina." />
        ) : null}
        {openVisits !== null && openVisits.length > 0 ? (
          <div className={styles.openList}>
            {openVisits.map((v) => (
              <div key={v.id} className={styles.openRow}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 'var(--sp-2)' }}>
                    <span className={`badge ${KIND_BADGE[v.kind]}`}>{KIND_LABEL[v.kind]}</span>
                    <span className="mono">{v.orderNumber}</span>
                  </div>
                  <div className={styles.customer} style={{ marginTop: 4 }}>
                    {v.customer ?? '—'}
                  </div>
                  <div className={styles.line}>{v.siteAddress ?? 'Adresa nije unesena'}</div>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    className={`btn btn-primary ${styles.touch}`}
                    onClick={() => {
                      setScheduleId(v.id);
                    }}
                  >
                    Zakaži
                  </button>
                ) : (
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    Zakazivanje traži pravo service.manage
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {detail ? (
        <VisitDetail
          visit={detail}
          canManage={canManage}
          onClose={() => setDetailId(null)}
          onSchedule={() => {
            setScheduleId(detail.id);
            setDetailId(null);
          }}
          onChanged={(message) => {
            setNotice(message);
            setDetailId(null);
            reloadAll();
          }}
        />
      ) : null}

      {scheduling ? (
        <ScheduleDialog
          visit={scheduling}
          defaultDay={days.some((d) => d.isToday) ? ymd(new Date()) : from}
          canManage={canManage}
          onClose={() => {
            setScheduleId(null);
            if (window.location.search.includes('visit=')) {
              window.history.replaceState(null, '', window.location.pathname);
            }
          }}
          onScheduled={(v) => {
            setScheduleId(null);
            if (window.location.search.includes('visit=')) {
              window.history.replaceState(null, '', window.location.pathname);
            }
            setNotice(`Termin ${v.orderNumber} je zakazan: ${fullSlot(v)}.`);
            if (v.slotStart) setWeekStart(mondayOf(new Date(v.slotStart)));
            reloadAll();
          }}
        />
      ) : null}

      {newMeasurement ? (
        <NewMeasurementDialog
          onClose={() => setNewMeasurement(false)}
          onCreated={(v, scheduleNow) => {
            setNewMeasurement(false);
            setExtra((x) => ({ ...x, [v.id]: v }));
            setNotice(`Mjerenje ${v.orderNumber} je kreirano.`);
            loadOpen();
            if (scheduleNow) {
              setScheduleId(v.id);
            }
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------- detail panel */

function Dialog({
  title,
  onClose,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  return (
    <div className="dialog-scrim" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spread">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onClose}
            disabled={busy}
            aria-label="Zatvori"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function VisitDetail({
  visit,
  canManage,
  onClose,
  onSchedule,
  onChanged,
}: {
  visit: VisitView;
  canManage: boolean;
  onClose: () => void;
  onSchedule: () => void;
  onChanged: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [report, setReport] = useState('');

  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged(message);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const reportOk = report.trim().length >= 5;

  return (
    <Dialog title={`${KIND_LABEL[visit.kind]} ${visit.orderNumber}`} onClose={onClose} busy={busy}>
      <div className="row" style={{ margin: 'var(--sp-3) 0' }}>
        <span className={`badge ${KIND_BADGE[visit.kind]}`}>{KIND_LABEL[visit.kind]}</span>
        <span className={`badge ${STATUS_BADGE[visit.status]}`}>{STATUS_LABEL[visit.status]}</span>
      </div>
      <div className="dialog-body">
        <div className="fact">
          <span>Kupac</span>
          <strong>{visit.customer ?? '—'}</strong>
        </div>
        <div className="fact">
          <span>Adresa</span>
          <span style={{ textAlign: 'right' }}>{visit.siteAddress ?? 'Nije unesena'}</span>
        </div>
        <div className="fact">
          <span>Termin</span>
          <span>{fullSlot(visit)}</span>
        </div>
        <div className="fact">
          <span>Ekipa</span>
          <span style={{ textAlign: 'right' }}>{crewNames(visit) || '—'}</span>
        </div>
        <div className="fact">
          <span>Vozilo</span>
          <span>
            {visit.vehicle ? `${visit.vehicle.plate} · ${visit.vehicle.name}` : 'Bez vozila'}
          </span>
        </div>
        {visit.salesOrderId ? (
          <div className="fact">
            <span>Narudžba</span>
            <Link href={`/orders?order=${encodeURIComponent(visit.salesOrderId)}`}>
              Otvori narudžbu
            </Link>
          </div>
        ) : null}
        {visit.report ? (
          <div style={{ marginTop: 'var(--sp-3)' }}>
            <span className="label" style={{ marginTop: 0 }}>
              Izvještaj
            </span>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{visit.report}</p>
          </div>
        ) : null}
      </div>

      {error ? <ErrorState text={error} /> : null}

      {completing ? (
        <div>
          <label className="label" htmlFor="visit-report">
            Izvještaj s terena (najmanje 5 znakova)
          </label>
          <textarea
            id="visit-report"
            className={`input ${styles.textarea}`}
            value={report}
            onChange={(e) => setReport(e.target.value)}
            maxLength={4000}
            placeholder="Šta je urađeno, napomene za kupca, eventualne razlike u mjerama…"
            autoFocus
          />
        </div>
      ) : null}

      {!canManage ? (
        <p className="alert alert-warn">
          Pregled je dostupan, ali za zakazivanje, početak i završetak treba pravo service.manage.
        </p>
      ) : (
        <div className={styles.actions}>
          {visit.status === 'PLANNED' || visit.status === 'SCHEDULED' ? (
            <button type="button" className="btn" onClick={onSchedule} disabled={busy}>
              {visit.status === 'PLANNED' ? 'Zakaži' : 'Promijeni termin'}
            </button>
          ) : null}
          {visit.status === 'SCHEDULED' ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                void run(
                  () => api('POST', `/api/v1/service/orders/${visit.id}/start`),
                  `${visit.orderNumber} je u toku.`,
                )
              }
            >
              {busy ? 'Pokrećem…' : 'Počni'}
            </button>
          ) : null}
          {visit.status === 'IN_PROGRESS' && !completing ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCompleting(true)}
              disabled={busy}
            >
              Završi
            </button>
          ) : null}
          {visit.status === 'IN_PROGRESS' && completing ? (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => setCompleting(false)}
                disabled={busy}
              >
                Nazad
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !reportOk}
                title={reportOk ? undefined : 'Izvještaj mora imati najmanje 5 znakova'}
                onClick={() =>
                  void run(
                    () =>
                      api('POST', `/api/v1/service/orders/${visit.id}/complete`, {
                        report: report.trim(),
                      }),
                    `${visit.orderNumber} je završen.`,
                  )
                }
              >
                {busy ? 'Spremam…' : 'Potvrdi završetak'}
              </button>
            </>
          ) : null}
          {visit.status === 'DONE' || visit.status === 'CANCELLED' ? (
            <p className="muted" style={{ margin: 0 }}>
              {visit.status === 'DONE'
                ? 'Termin je završen — nema daljih koraka.'
                : 'Termin je otkazan.'}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

/* --------------------------------------------------------- schedule dialog */

function ScheduleDialog({
  visit,
  defaultDay,
  canManage,
  onClose,
  onScheduled,
}: {
  visit: Partial<VisitView> & { id: string };
  defaultDay: string;
  canManage: boolean;
  onClose: () => void;
  onScheduled: (v: VisitView) => void;
}) {
  const start = visit.slotStart ? new Date(visit.slotStart) : null;
  const end = visit.slotEnd ? new Date(visit.slotEnd) : null;
  const [date, setDate] = useState(start ? ymd(start) : defaultDay);
  const [fromTime, setFromTime] = useState(start ? hm(start) : '08:00');
  const [toTime, setToTime] = useState(end ? hm(end) : '10:00');
  const [crew, setCrew] = useState<string[]>(visit.crewEmployeeIds ?? []);
  const [vehicleId, setVehicleId] = useState(visit.vehicleId ?? '');
  const [employees, setEmployees] = useState<EmployeeOption[] | null>(null);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<VehicleOption[] | null>(null);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [crewFilter, setCrewFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    api<{ employees: EmployeeOption[] }>('GET', '/api/v1/employees')
      .then((r) => setEmployees(r.employees))
      .catch((e: unknown) => {
        setEmployees([]);
        setEmployeesError(errorText(e));
      });
    api<{ vehicles: VehicleOption[] }>('GET', '/api/v1/logistics/vehicles')
      .then((r) => setVehicles(r.vehicles))
      .catch((e: unknown) => {
        setVehicles([]);
        setVehiclesError(errorText(e));
      });
  }, []);

  const slotStart = new Date(`${date}T${fromTime}`);
  const slotEnd = new Date(`${date}T${toTime}`);
  const slotValid =
    !Number.isNaN(slotStart.getTime()) && !Number.isNaN(slotEnd.getTime()) && slotEnd > slotStart;
  const crewValid = crew.length >= 1 && crew.length <= 10;

  const blockedReason = !canManage
    ? 'Zakazivanje traži pravo service.manage.'
    : !slotValid
      ? 'Kraj termina mora biti poslije početka.'
      : !crewValid
        ? 'Odaberite od 1 do 10 članova ekipe.'
        : null;

  const toggleCrew = (id: string) =>
    setCrew((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const visibleEmployees = (employees ?? []).filter((e) =>
    e.name.toLowerCase().includes(crewFilter.trim().toLowerCase()),
  );
  const activeVehicles = (vehicles ?? []).filter((v) => v.active || v.id === vehicleId);

  const submit = async () => {
    if (blockedReason) return;
    setBusy(true);
    setError(null);
    setConflict(null);
    try {
      const updated = await api<VisitView>('POST', `/api/v1/service/visits/${visit.id}/schedule`, {
        slotStart: slotStart.toISOString(),
        slotEnd: slotEnd.toISOString(),
        crewEmployeeIds: crew,
        ...(vehicleId ? { vehicleId } : {}),
      });
      onScheduled(updated);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) setConflict(e.body.message);
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const title = visit.orderNumber
    ? `${visit.slotStart ? 'Promijeni termin' : 'Zakaži'} · ${visit.orderNumber}`
    : 'Zakaži termin';

  return (
    <Dialog title={title} onClose={onClose} busy={busy}>
      {visit.customer || visit.siteAddress ? (
        <p className="muted" style={{ margin: 'var(--sp-2) 0 0' }}>
          {visit.kind ? `${KIND_LABEL[visit.kind]} · ` : ''}
          {visit.customer ?? ''}
          {visit.siteAddress ? ` · ${visit.siteAddress}` : ''}
        </p>
      ) : null}

      {conflict ? (
        <div className="alert alert-error" role="alert">
          <div className={styles.conflict}>Termin je zauzet</div>
          <div>{conflict}</div>
          <div style={{ marginTop: 4 }}>
            Promijenite vrijeme, ekipu ili vozilo pa pokušajte ponovo.
          </div>
        </div>
      ) : null}
      {error ? <ErrorState text={error} /> : null}

      <label className="label" htmlFor="slot-date">
        Datum
      </label>
      <input
        id="slot-date"
        type="date"
        className={`input ${styles.touch}`}
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <div className={styles.timeRow}>
        <div>
          <label className="label" htmlFor="slot-from">
            Od
          </label>
          <input
            id="slot-from"
            type="time"
            step={900}
            className={`input ${styles.touch}`}
            value={fromTime}
            onChange={(e) => setFromTime(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="slot-to">
            Do
          </label>
          <input
            id="slot-to"
            type="time"
            step={900}
            className={`input ${styles.touch}`}
            value={toTime}
            onChange={(e) => setToTime(e.target.value)}
          />
        </div>
      </div>

      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="label">
          Ekipa {crew.length > 0 ? `(${crew.length} odabrano)` : ''}
        </legend>
        {employees === null ? <LoadingState text="Učitavanje zaposlenih…" /> : null}
        {employeesError ? <ErrorState text={employeesError} /> : null}
        {employees !== null && employees.length === 0 && !employeesError ? (
          <EmptyState text="Nema aktivnih zaposlenih za ekipu." />
        ) : null}
        {employees !== null && employees.length > 8 ? (
          <input
            className="input"
            style={{ marginBottom: 'var(--sp-2)' }}
            placeholder="Traži osobu…"
            aria-label="Traži osobu"
            value={crewFilter}
            onChange={(e) => setCrewFilter(e.target.value)}
          />
        ) : null}
        {employees !== null && employees.length > 0 ? (
          <div className="pick-list">
            {visibleEmployees.map((e) => (
              <label key={e.id} style={{ minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={crew.includes(e.id)}
                  onChange={() => toggleCrew(e.id)}
                  style={{ width: 20, height: 20 }}
                />
                <span>
                  {e.name}
                  {e.title ? <span className="muted"> · {e.title}</span> : null}
                </span>
              </label>
            ))}
            {visibleEmployees.length === 0 ? (
              <div className="muted" style={{ padding: 'var(--sp-2) 0' }}>
                Nema osobe s tim imenom.
              </div>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <label className="label" htmlFor="slot-vehicle">
        Vozilo (opcionalno)
      </label>
      {vehiclesError ? <ErrorState text={vehiclesError} /> : null}
      <select
        id="slot-vehicle"
        className={`select ${styles.touch}`}
        value={vehicleId}
        onChange={(e) => setVehicleId(e.target.value)}
        disabled={vehicles === null}
      >
        <option value="">{vehicles === null ? 'Učitavanje…' : 'Bez vozila'}</option>
        {activeVehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.plate} · {v.name}
          </option>
        ))}
      </select>

      {blockedReason ? (
        <p className="muted" style={{ fontSize: 12.5, margin: 'var(--sp-3) 0 0' }} role="note">
          {blockedReason}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Odustani
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void submit()}
          disabled={busy || !!blockedReason}
        >
          {busy ? 'Zakazujem…' : 'Potvrdi termin'}
        </button>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------- new measurement dialog */

function NewMeasurementDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (v: VisitView, scheduleNow: boolean) => void;
}) {
  const [accounts, setAccounts] = useState<AccountOption[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [accountId, setAccountId] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ accounts: AccountOption[] }>('GET', '/api/v1/crm/accounts')
      .then((r) => setAccounts(r.accounts))
      .catch((e: unknown) => {
        setAccounts([]);
        setAccountsError(errorText(e));
      });
  }, []);

  const needle = q.trim().toLowerCase();
  const matches = (accounts ?? []).filter(
    (a) =>
      !needle ||
      a.partyName.toLowerCase().includes(needle) ||
      a.accountNumber.toLowerCase().includes(needle),
  );

  const submit = async (scheduleNow: boolean) => {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api<VisitView>('POST', '/api/v1/service/visits/measurements', {
        accountId,
        ...(address.trim() ? { siteAddress: address.trim() } : {}),
      });
      const name = accounts?.find((a) => a.id === accountId)?.partyName ?? null;
      onCreated({ ...created, customer: created.customer ?? name }, scheduleNow);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Novo mjerenje" onClose={onClose} busy={busy}>
      <p className="muted" style={{ margin: 'var(--sp-2) 0 0' }}>
        Kupac i adresa objekta; termin i ekipu možete odrediti odmah ili kasnije iz liste
        „Nezakazano”.
      </p>
      {error ? <ErrorState text={error} /> : null}

      <label className="label" htmlFor="m-search">
        Kupac
      </label>
      {accounts === null ? <LoadingState text="Učitavanje kupaca…" /> : null}
      {accountsError ? <ErrorState text={accountsError} /> : null}
      {accounts !== null && accounts.length === 0 && !accountsError ? (
        <EmptyState text="Nema kupaca u CRM-u — prvo dodajte kupca." />
      ) : null}
      {accounts !== null && accounts.length > 0 ? (
        <>
          <input
            id="m-search"
            className={`input ${styles.touch}`}
            placeholder="Traži po nazivu ili broju…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className={`select ${styles.touch}`}
            style={{ marginTop: 'var(--sp-2)' }}
            aria-label="Odabrani kupac"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">
              {matches.length === 0 ? 'Nema rezultata' : `Odaberite kupca (${matches.length})`}
            </option>
            {matches.slice(0, 200).map((a) => (
              <option key={a.id} value={a.id}>
                {a.partyName} · {a.accountNumber}
              </option>
            ))}
          </select>
        </>
      ) : null}

      <label className="label" htmlFor="m-address">
        Adresa objekta
      </label>
      <input
        id="m-address"
        className={`input ${styles.touch}`}
        value={address}
        maxLength={300}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Ulica i broj, mjesto"
        autoComplete="street-address"
      />

      {!accountId ? (
        <p className="muted" style={{ fontSize: 12.5, margin: 'var(--sp-3) 0 0' }} role="note">
          Odaberite kupca da biste kreirali mjerenje.
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className="btn"
          onClick={() => void submit(false)}
          disabled={busy || !accountId}
        >
          Kreiraj
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void submit(true)}
          disabled={busy || !accountId}
        >
          {busy ? 'Kreiram…' : 'Kreiraj i zakaži'}
        </button>
      </div>
    </Dialog>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from '../../../lib/api';
import { submissionResolvedByError } from '../../../lib/idempotency';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '../../../components/ui';
import { Fact, devErrorText, type DevSettings, type TemplateView } from './shared';

/**
 * HCM-017 (Sprint 237) — one employee's development: assignment (mentor
 * + qualification level, hcm.development.manage), training plans with
 * item checks (optimistic concurrency, closed items never reopen) and
 * the append-only training record. Labels come from the server settings.
 */

export interface DevEmployee {
  employeeId: string;
  employeeNumber: string;
  name: string;
  mentorUserId: string | null;
  qualificationLevel: string | null;
  openPlans: number;
  overdue: number;
  rechecksDue: number;
}

export interface UserOption {
  id: string;
  displayName: string;
}

interface PlanBody {
  employeeId: string;
  templateKey?: string;
  dueDate: string;
  recheckDate?: string;
}

interface RecordBody {
  employeeId: string;
  sessionDate: string;
  topic: string;
  notes: string;
  outcome?: string;
  recheckDate?: string;
}

/** An idempotent submission awaiting a clear outcome (key + content). */
export type Pending =
  { kind: 'plan'; key: string; body: PlanBody } | { kind: 'record'; key: string; body: RecordBody };

type PlanStatus = 'OPEN' | 'CLOSED';

interface PlanRow {
  id: string;
  employeeId: string;
  title: string;
  status: PlanStatus;
  dueDate: string;
  recheckDate: string | null;
}

interface PlanItem {
  itemKey: string;
  text: string;
  status: string;
  closed: boolean;
  note: string | null;
  version: number;
}

interface PlanView extends PlanRow {
  templateKey: string;
  templateVersion: number;
  closedAt: string | null;
  items: PlanItem[];
}

interface RecordRow {
  id: string;
  sessionDate: string;
  topic: string;
  notes: string;
  outcome: string | null;
  recheckDate: string | null;
  createdAt: string;
}

const PLAN_STATUS_LABEL: Record<PlanStatus, string> = { OPEN: 'Otvoren', CLOSED: 'Zatvoren' };
const today = () => new Date().toISOString().slice(0, 10);
const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('bs-BA') : '—');

export function EmployeeDevelopment({
  employee,
  settings,
  templates,
  users,
  usersError,
  canManage,
  pending,
  mentorLabel,
  onChanged,
}: {
  employee: DevEmployee;
  settings: DevSettings;
  templates: TemplateView[];
  users: UserOption[] | null;
  usersError: string | null;
  canManage: boolean;
  pending: Map<string, Pending>;
  mentorLabel: (id: string | null) => string | null;
  onChanged: () => void;
}) {
  const id = employee.employeeId;
  const planPendingKey = `plan:${id}`;
  const recordPendingKey = `record:${id}`;
  const statusLabel = (s: string) => settings.itemStatuses[s] ?? s;
  const levelLabel = (k: string | null) =>
    k ? (settings.qualificationLevels.find((l) => l.key === k)?.label ?? k) : '—';

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Assignment.
  const [aMentor, setAMentor] = useState(employee.mentorUserId ?? '');
  const [aLevel, setALevel] = useState(employee.qualificationLevel ?? '');

  // Plans.
  const [planStatus, setPlanStatus] = useState<PlanStatus>('OPEN');
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { status: string; note: string }>>({});
  const [confirmClose, setConfirmClose] = useState(false);

  // Start plan form (idempotent).
  const [pTemplate, setPTemplate] = useState('');
  const [pDue, setPDue] = useState('');
  const [pRecheck, setPRecheck] = useState('');
  const [confirmStart, setConfirmStart] = useState(false);
  const [hasPlanPending, setHasPlanPending] = useState(() => pending.has(planPendingKey));

  // Records (append-only, idempotent).
  const [records, setRecords] = useState<RecordRow[] | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [rDate, setRDate] = useState(today);
  const [rTopic, setRTopic] = useState('');
  const [rNotes, setRNotes] = useState('');
  const [rOutcome, setROutcome] = useState('');
  const [rRecheck, setRRecheck] = useState('');
  const [confirmRecord, setConfirmRecord] = useState(false);
  const [hasRecordPending, setHasRecordPending] = useState(() => pending.has(recordPendingKey));

  const loadPlans = useCallback(() => {
    api<{ plans: PlanRow[] }>(
      'GET',
      `/api/v1/hcm/development/plans?employeeId=${encodeURIComponent(id)}&status=${planStatus}`,
    )
      .then((r) => {
        setPlans(r.plans);
        setPlansError(null);
      })
      .catch((e: unknown) => {
        setPlans([]);
        setPlansError(devErrorText(e));
      });
  }, [id, planStatus]);

  const loadRecords = useCallback(() => {
    api<{ records: RecordRow[] }>(
      'GET',
      `/api/v1/hcm/development/records?employeeId=${encodeURIComponent(id)}`,
    )
      .then((r) => {
        setRecords(r.records);
        setRecordsError(null);
      })
      .catch((e: unknown) => {
        setRecords([]);
        setRecordsError(devErrorText(e));
      });
  }, [id]);

  useEffect(loadPlans, [loadPlans]);
  useEffect(loadRecords, [loadRecords]);

  function showPlan(p: PlanView) {
    setPlan(p);
    setDrafts(
      Object.fromEntries(p.items.map((i) => [i.itemKey, { status: i.status, note: i.note ?? '' }])),
    );
  }

  function openPlan(planId: string) {
    setPlanError(null);
    setConfirmClose(false);
    api<PlanView>('GET', `/api/v1/hcm/development/plans/${planId}`)
      .then(showPlan)
      .catch((e: unknown) => {
        setPlan(null);
        setPlanError(devErrorText(e));
      });
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e: unknown) {
      setError(devErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------- assignment
  const assignmentChanged =
    (aMentor || null) !== employee.mentorUserId || (aLevel || null) !== employee.qualificationLevel;

  function saveAssignment() {
    void run(async () => {
      await api('POST', `/api/v1/hcm/development/employees/${id}/assignment`, {
        mentorUserId: aMentor.trim() || null,
        qualificationLevel: aLevel || null,
      });
      setNotice('Dodjela mentora i nivo kvalifikacije su sačuvani.');
      onChanged();
    });
  }

  // ---------------------------------------------------------- plan items
  function saveItem(item: PlanItem) {
    if (!plan) return;
    const d = drafts[item.itemKey] ?? { status: item.status, note: item.note ?? '' };
    const planId = plan.id;
    void run(async () => {
      try {
        const r = await api<PlanView>(
          'POST',
          `/api/v1/hcm/development/plans/${planId}/items/${encodeURIComponent(item.itemKey)}`,
          {
            status: d.status,
            ...(d.note.trim() ? { note: d.note.trim() } : {}),
            expectedVersion: item.version,
          },
        );
        showPlan(r);
        setNotice(`Stavka „${item.text}” sačuvana: ${statusLabel(d.status)}.`);
        onChanged();
      } catch (e) {
        if (e instanceof ApiRequestError && e.body.code === 'CONFLICT') {
          openPlan(planId);
          throw new Error(
            'Stavku je u međuvremenu izmijenio neko drugi — učitano je aktuelno stanje plana; ponovite izmjenu.',
          );
        }
        throw e;
      }
    });
  }

  const openItems = plan ? plan.items.filter((i) => !i.closed).length : 0;
  const closedStatusLabels = settings.closedStatuses.map(statusLabel).join(' / ');

  // ---------------------------------------------------------- start plan
  const currentPlanBody = (): PlanBody => ({
    employeeId: id,
    ...(pTemplate ? { templateKey: pTemplate } : {}),
    dueDate: pDue,
    ...(pRecheck ? { recheckDate: pRecheck } : {}),
  });
  const planHint = !pDue
    ? 'Unesite rok plana'
    : pRecheck && pRecheck < pDue
      ? 'Ponovna provjera ne može biti prije roka'
      : null;
  const pendingPlan = pending.get(planPendingKey);
  const dialogPlan = pendingPlan?.kind === 'plan' ? pendingPlan.body : currentPlanBody();
  const templateLabel = (key: string | undefined) => {
    if (!key) {
      const t = templates.find(
        (x) => employee.qualificationLevel && x.qualificationLevel === employee.qualificationLevel,
      );
      return t ? `Zadani za nivo: ${t.name} (${t.key} v${t.version})` : 'Zadani za nivo zaposlenog';
    }
    const t = templates.find((x) => x.key === key);
    return t ? `${t.name} (${t.key} v${t.version})` : key;
  };

  function startPlan() {
    void run(async () => {
      let p = pending.get(planPendingKey);
      if (!p || p.kind !== 'plan') {
        p = { kind: 'plan', key: crypto.randomUUID(), body: currentPlanBody() };
        pending.set(planPendingKey, p);
        setHasPlanPending(true);
      }
      let r: PlanView;
      try {
        r = await api<PlanView>('POST', '/api/v1/hcm/development/plans', {
          ...p.body,
          requestKey: p.key,
        });
      } catch (e) {
        // Discard key+content only on a business-unambiguous rejection;
        // CONFLICT, 401/403, 5xx and network errors keep them for a safe
        // retry under the same key.
        if (e instanceof ApiRequestError && submissionResolvedByError(e.status, e.body.code)) {
          pending.delete(planPendingKey);
          setHasPlanPending(false);
        }
        setConfirmStart(false);
        throw e;
      }
      pending.delete(planPendingKey);
      setHasPlanPending(false);
      setConfirmStart(false);
      setPDue('');
      setPRecheck('');
      setPTemplate('');
      showPlan(r);
      setPlanStatus('OPEN');
      loadPlans();
      onChanged();
      setNotice(
        `Plan obuke „${r.title}” je pokrenut (šablon ${r.templateKey} v${r.templateVersion}).`,
      );
    });
  }

  // ---------------------------------------------------------- records
  const currentRecordBody = (): RecordBody => ({
    employeeId: id,
    sessionDate: rDate,
    topic: rTopic.trim(),
    notes: rNotes.trim(),
    ...(rOutcome.trim() ? { outcome: rOutcome.trim() } : {}),
    ...(rRecheck ? { recheckDate: rRecheck } : {}),
  });
  const recordHint = !rDate
    ? 'Unesite datum obuke'
    : !rTopic.trim()
      ? 'Unesite temu'
      : !rNotes.trim()
        ? 'Unesite bilješke'
        : null;
  const pendingRecord = pending.get(recordPendingKey);
  const dialogRecord = pendingRecord?.kind === 'record' ? pendingRecord.body : currentRecordBody();

  function logRecord() {
    void run(async () => {
      let p = pending.get(recordPendingKey);
      if (!p || p.kind !== 'record') {
        p = { kind: 'record', key: crypto.randomUUID(), body: currentRecordBody() };
        pending.set(recordPendingKey, p);
        setHasRecordPending(true);
      }
      try {
        await api<RecordRow>('POST', '/api/v1/hcm/development/records', {
          ...p.body,
          requestKey: p.key,
        });
      } catch (e) {
        if (e instanceof ApiRequestError && submissionResolvedByError(e.status, e.body.code)) {
          pending.delete(recordPendingKey);
          setHasRecordPending(false);
        }
        setConfirmRecord(false);
        throw e;
      }
      pending.delete(recordPendingKey);
      setHasRecordPending(false);
      setConfirmRecord(false);
      setRTopic('');
      setRNotes('');
      setROutcome('');
      setRRecheck('');
      loadRecords();
      onChanged();
      setNotice('Obuka je evidentirana.');
    });
  }

  // ---------------------------------------------------------- columns
  const planColumns: Array<Column<PlanRow>> = [
    { key: 'title', header: 'Plan', render: (p) => p.title, text: (p) => p.title },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <span className={`badge ${p.status === 'OPEN' ? 'badge-info' : 'badge-ok'}`}>
          {PLAN_STATUS_LABEL[p.status]}
        </span>
      ),
    },
    {
      key: 'due',
      header: 'Rok',
      render: (p) => <span className="mono">{p.dueDate}</span>,
      text: (p) => p.dueDate,
    },
    {
      key: 'recheck',
      header: 'Ponovna provjera',
      render: (p) =>
        p.recheckDate ? (
          <span className="mono">{p.recheckDate}</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
  ];

  const recordColumns: Array<Column<RecordRow>> = [
    {
      key: 'date',
      header: 'Datum',
      render: (r) => <span className="mono">{r.sessionDate}</span>,
      text: (r) => r.sessionDate,
    },
    { key: 'topic', header: 'Tema', render: (r) => r.topic, text: (r) => r.topic },
    {
      key: 'notes',
      header: 'Bilješke',
      render: (r) => <span style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</span>,
      text: (r) => r.notes,
    },
    {
      key: 'outcome',
      header: 'Ishod',
      render: (r) => r.outcome ?? <span className="muted">—</span>,
      text: (r) => r.outcome ?? '',
    },
    {
      key: 'recheck',
      header: 'Ponovna provjera',
      render: (r) =>
        r.recheckDate ? (
          <span className="mono">{r.recheckDate}</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'created',
      header: 'Upisano',
      render: (r) => <span className="mono">{fmtDateTime(r.createdAt)}</span>,
    },
  ];

  return (
    <>
      <div className="card">
        <div className="spread" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ marginBottom: 0 }}>
            {employee.name} (<span className="mono">{employee.employeeNumber}</span>)
          </h2>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Nivo: {levelLabel(employee.qualificationLevel)}
          </span>
        </div>
        {error ? <ErrorState text={error} /> : null}
        {notice ? <div className="alert alert-ok">{notice}</div> : null}

        {canManage ? (
          <div style={{ marginTop: 12 }}>
            <h2>Dodjela</h2>
            <div className="grid-2">
              <div>
                <label className="label" htmlFor="dev-mentor">
                  Mentor (korisnik aplikacije)
                </label>
                {users !== null ? (
                  <select
                    id="dev-mentor"
                    className="select"
                    value={aMentor}
                    onChange={(e) => setAMentor(e.target.value)}
                  >
                    <option value="">— bez mentora —</option>
                    {aMentor && !users.some((u) => u.id === aMentor) ? (
                      <option value={aMentor}>{mentorLabel(aMentor) ?? aMentor}</option>
                    ) : null}
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      id="dev-mentor"
                      className="input mono"
                      placeholder="ID korisnika (prazno = bez mentora)"
                      value={aMentor}
                      onChange={(e) => setAMentor(e.target.value)}
                    />
                    <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                      Lista korisnika nije dostupna
                      {usersError ? ` (${usersError})` : ''} — za izbor iz liste potrebna je dozvola
                      iam.user.manage; unesite ID korisnika.
                    </p>
                  </>
                )}
              </div>
              <div>
                <label className="label" htmlFor="dev-level">
                  Nivo kvalifikacije
                </label>
                <select
                  id="dev-level"
                  className="select"
                  value={aLevel}
                  onChange={(e) => setALevel(e.target.value)}
                >
                  <option value="">— bez nivoa —</option>
                  {settings.qualificationLevels.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || !assignmentChanged}
                title={!assignmentChanged ? 'Nema izmjena' : undefined}
                onClick={saveAssignment}
              >
                Sačuvaj dodjelu
              </button>
              <span className="muted" style={{ fontSize: 12.5 }}>
                Mentor vidi samo zaposlene kojima je dodijeljen.
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="spread" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ marginBottom: 0 }}>Planovi obuke</h2>
            <select
              className="select"
              style={{ maxWidth: 160 }}
              aria-label="Status plana"
              value={planStatus}
              onChange={(e) => setPlanStatus(e.target.value as PlanStatus)}
            >
              <option value="OPEN">Otvoreni</option>
              <option value="CLOSED">Zatvoreni</option>
            </select>
          </div>
          <div style={{ marginTop: 12 }}>
            {plansError ? <ErrorState text={plansError} /> : null}
            {plans === null ? (
              <LoadingState text="Učitavanje planova…" />
            ) : (
              <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
                <DataTable
                  columns={planColumns}
                  rows={plans}
                  rowKey={(p) => p.id}
                  onRowClick={(p) => openPlan(p.id)}
                  emptyText={
                    planStatus === 'OPEN' ? 'Nema otvorenih planova.' : 'Nema zatvorenih planova.'
                  }
                />
              </div>
            )}
          </div>

          <h2 style={{ marginTop: 16 }}>Novi plan obuke</h2>
          {hasPlanPending ? (
            <p className="alert alert-warn">
              Prethodno pokretanje plana nije potvrđeno od servera. Ponovno slanje šalje RANIJE
              PREDANI sadržaj pod istim ključem (bez duplikata).
            </p>
          ) : null}
          <label className="label" htmlFor="dev-template">
            Šablon
          </label>
          <select
            id="dev-template"
            className="select"
            value={pTemplate}
            onChange={(e) => setPTemplate(e.target.value)}
          >
            <option value="">{templateLabel(undefined)}</option>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name} ({t.key} v{t.version})
              </option>
            ))}
          </select>
          <label className="label" htmlFor="dev-due">
            Rok
          </label>
          <input
            id="dev-due"
            className="input"
            type="date"
            value={pDue}
            onChange={(e) => setPDue(e.target.value)}
          />
          <label className="label" htmlFor="dev-recheck">
            Ponovna provjera (opcionalno)
          </label>
          <input
            id="dev-recheck"
            className="input"
            type="date"
            min={pDue || undefined}
            value={pRecheck}
            onChange={(e) => setPRecheck(e.target.value)}
          />
          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || (planHint !== null && !hasPlanPending)}
              title={!hasPlanPending && planHint ? planHint : undefined}
              onClick={() => setConfirmStart(true)}
            >
              {hasPlanPending ? 'Ponovi slanje' : 'Pokreni plan'}
            </button>
            {!hasPlanPending && planHint ? (
              <span className="muted" style={{ fontSize: 12.5 }}>
                {planHint}
              </span>
            ) : null}
          </div>
        </div>

        <div className="card">
          <h2>Plan</h2>
          {planError ? <ErrorState text={planError} /> : null}
          {!plan ? (
            <EmptyState text="Odaberite plan iz liste." />
          ) : (
            <>
              <Fact label="Naziv">{plan.title}</Fact>
              <Fact label="Šablon">
                <span className="mono">
                  {plan.templateKey} v{plan.templateVersion}
                </span>
              </Fact>
              <Fact label="Status">
                <span className={`badge ${plan.status === 'OPEN' ? 'badge-info' : 'badge-ok'}`}>
                  {PLAN_STATUS_LABEL[plan.status]}
                </span>
              </Fact>
              <Fact label="Rok">
                <span className="mono">{plan.dueDate}</span>
              </Fact>
              <Fact label="Ponovna provjera">
                <span className="mono">{plan.recheckDate ?? '—'}</span>
              </Fact>
              {plan.closedAt ? (
                <Fact label="Zatvoren">
                  <span className="mono">{fmtDateTime(plan.closedAt)}</span>
                </Fact>
              ) : null}

              <div style={{ marginTop: 12 }}>
                {plan.items.length === 0 ? <EmptyState text="Plan nema stavki." /> : null}
                {plan.items.map((item) => {
                  const d = drafts[item.itemKey] ?? {
                    status: item.status,
                    note: item.note ?? '',
                  };
                  const dirty = d.status !== item.status || d.note.trim() !== (item.note ?? '');
                  const readOnly = plan.status === 'CLOSED';
                  return (
                    <div
                      key={item.itemKey}
                      style={{
                        borderTop: '1px solid var(--color-border)',
                        padding: '10px 0',
                      }}
                    >
                      <div className="spread" style={{ flexWrap: 'wrap', gap: 6 }}>
                        <strong>{item.text}</strong>
                        <span className={`badge ${item.closed ? 'badge-ok' : 'badge-warn'}`}>
                          {statusLabel(item.status)}
                        </span>
                      </div>
                      {readOnly ? (
                        item.note ? (
                          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
                            {item.note}
                          </p>
                        ) : null
                      ) : (
                        <>
                          <div className="row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
                            <select
                              className="select"
                              style={{ maxWidth: 240 }}
                              aria-label={`Status: ${item.text}`}
                              value={d.status}
                              disabled={item.closed}
                              title={
                                item.closed
                                  ? 'Zatvorena stavka se ne može ponovo otvoriti — po potrebi pokrenite novi plan obuke'
                                  : undefined
                              }
                              onChange={(e) =>
                                setDrafts({
                                  ...drafts,
                                  [item.itemKey]: { ...d, status: e.target.value },
                                })
                              }
                            >
                              {Object.entries(settings.itemStatuses).map(([k, label]) => (
                                <option key={k} value={k}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <input
                              className="input"
                              style={{ flex: 1, minWidth: 160 }}
                              aria-label={`Napomena: ${item.text}`}
                              placeholder="Napomena (opcionalno)"
                              maxLength={500}
                              value={d.note}
                              onChange={(e) =>
                                setDrafts({
                                  ...drafts,
                                  [item.itemKey]: { ...d, note: e.target.value },
                                })
                              }
                            />
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={busy || !dirty}
                              onClick={() => saveItem(item)}
                            >
                              Sačuvaj
                            </button>
                          </div>
                          {item.closed ? (
                            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                              Zatvorena stavka se ne može ponovo otvoriti; napomena se može
                              dopuniti.
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {plan.status === 'OPEN' ? (
                <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy || openItems > 0}
                    title={
                      openItems > 0
                        ? `Još ${openItems} stavki nije zatvoreno (${closedStatusLabels})`
                        : undefined
                    }
                    onClick={() => setConfirmClose(true)}
                  >
                    Zatvori plan
                  </button>
                  {openItems > 0 ? (
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      Plan se zatvara kad su sve stavke zatvorene ({closedStatusLabels}); otvoreno:{' '}
                      {openItems}.
                    </span>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Evidencija obuke</h2>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
          Unosi se ne mijenjaju niti brišu — ispravka = novi unos.
        </p>
        {recordsError ? <ErrorState text={recordsError} /> : null}
        {records === null ? (
          <LoadingState text="Učitavanje evidencije…" />
        ) : (
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <DataTable
              columns={recordColumns}
              rows={records}
              rowKey={(r) => r.id}
              searchPlaceholder="Pretraga evidencije…"
              emptyText="Još nema evidentiranih obuka."
            />
          </div>
        )}

        <h2 style={{ marginTop: 16 }}>Novi unos</h2>
        {hasRecordPending ? (
          <p className="alert alert-warn">
            Prethodni unos nije potvrđen od servera. Ponovno slanje šalje RANIJE PREDANI sadržaj pod
            istim ključem (bez duplikata).
          </p>
        ) : null}
        <div className="grid-2">
          <div>
            <label className="label" htmlFor="rec-date">
              Datum obuke
            </label>
            <input
              id="rec-date"
              className="input"
              type="date"
              value={rDate}
              onChange={(e) => setRDate(e.target.value)}
            />
            <label className="label" htmlFor="rec-topic">
              Tema
            </label>
            <input
              id="rec-topic"
              className="input"
              maxLength={200}
              placeholder="npr. Rad na mašini pod nadzorom"
              value={rTopic}
              onChange={(e) => setRTopic(e.target.value)}
            />
            <label className="label" htmlFor="rec-outcome">
              Ishod (opcionalno)
            </label>
            <input
              id="rec-outcome"
              className="input"
              maxLength={500}
              value={rOutcome}
              onChange={(e) => setROutcome(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="rec-notes">
              Bilješke
            </label>
            <textarea
              id="rec-notes"
              className="input"
              rows={4}
              maxLength={4000}
              value={rNotes}
              onChange={(e) => setRNotes(e.target.value)}
            />
            <label className="label" htmlFor="rec-recheck">
              Ponovna provjera (opcionalno)
            </label>
            <input
              id="rec-recheck"
              className="input"
              type="date"
              value={rRecheck}
              onChange={(e) => setRRecheck(e.target.value)}
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || (recordHint !== null && !hasRecordPending)}
            title={!hasRecordPending && recordHint ? recordHint : undefined}
            onClick={() => setConfirmRecord(true)}
          >
            {hasRecordPending ? 'Ponovi slanje' : 'Pregledaj i evidentiraj'}
          </button>
          {!hasRecordPending && recordHint ? (
            <span className="muted" style={{ fontSize: 12.5 }}>
              {recordHint}
            </span>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmStart}
        title={hasPlanPending ? 'Ponovno slanje plana obuke' : 'Pokretanje plana obuke'}
        consequence={
          hasPlanPending
            ? 'Prethodno slanje nije potvrđeno — šalje se RANIJE PREDANI sadržaj pod istim ključem (bez duplikata).'
            : 'Plan se kreira iz trenutne verzije šablona; kasnije verzije šablona ga ne mijenjaju.'
        }
        confirmLabel="Pokreni plan"
        busy={busy}
        onCancel={() => setConfirmStart(false)}
        onConfirm={startPlan}
      >
        <Fact label="Zaposleni">{employee.name}</Fact>
        <Fact label="Šablon">{templateLabel(dialogPlan.templateKey)}</Fact>
        <Fact label="Rok">
          <span className="mono">{dialogPlan.dueDate}</span>
        </Fact>
        <Fact label="Ponovna provjera">
          <span className="mono">{dialogPlan.recheckDate ?? '—'}</span>
        </Fact>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmClose && plan !== null}
        title="Zatvaranje plana obuke"
        consequence="Zatvoren plan se više ne mijenja; za novu obuku pokreće se novi plan."
        confirmLabel="Zatvori plan"
        busy={busy}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          if (!plan) return;
          const planId = plan.id;
          void run(async () => {
            const r = await api<PlanView>('POST', `/api/v1/hcm/development/plans/${planId}/close`);
            setConfirmClose(false);
            showPlan(r);
            loadPlans();
            onChanged();
            setNotice(`Plan „${r.title}” je zatvoren.`);
          });
        }}
      >
        <Fact label="Plan">{plan?.title ?? ''}</Fact>
        <Fact label="Stavki">
          <span className="mono">{plan?.items.length ?? 0}</span>
        </Fact>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmRecord}
        title={hasRecordPending ? 'Ponovno slanje unosa' : 'Evidentiranje obuke'}
        consequence={
          hasRecordPending
            ? 'Prethodno slanje nije potvrđeno — šalje se RANIJE PREDANI sadržaj pod istim ključem (bez duplikata).'
            : 'Unos je trajan i ne može se mijenjati — ispravka = novi unos.'
        }
        confirmLabel="Evidentiraj"
        busy={busy}
        onCancel={() => setConfirmRecord(false)}
        onConfirm={logRecord}
      >
        <Fact label="Zaposleni">{employee.name}</Fact>
        <Fact label="Datum">
          <span className="mono">{dialogRecord.sessionDate}</span>
        </Fact>
        <Fact label="Tema">{dialogRecord.topic}</Fact>
        <Fact label="Ishod">{dialogRecord.outcome ?? '—'}</Fact>
        <Fact label="Ponovna provjera">
          <span className="mono">{dialogRecord.recheckDate ?? '—'}</span>
        </Fact>
      </ConfirmDialog>
    </>
  );
}

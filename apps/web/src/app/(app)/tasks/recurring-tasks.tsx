'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '../../../components/ui';
import {
  AssigneePicker,
  ChecklistBuilder,
  RULE_LABEL,
  fmtTime,
  userName,
  type ChecklistItem,
  type CompletionRule,
  type TeamAssignee,
  type UserOption,
} from './team-tasks';

/**
 * WF-013 (Sprint 246): periodični zadaci (task.manage) — predlošci
 * (dnevno/sedmično/mjesečno), ručno generisanje za datum (idempotentno na
 * serveru) i dnevnik izvršenja po datumima × izvršiocima.
 */

type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface TemplateView {
  id: string;
  code: string;
  title: string;
  description: string | null;
  frequency: Frequency;
  weekdays: number[];
  dayOfMonth: number | null;
  dueTime: string;
  assigneeUserIds: string[];
  completionRule: CompletionRule;
  checklist: ChecklistItem[];
  relatedObjectType: string | null;
  relatedObjectId: string | null;
  active: boolean;
}

interface Occurrence {
  taskId: string;
  date: string;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  missed: boolean;
  assignees: TeamAssignee[];
}

interface LogView {
  template: TemplateView;
  occurrences: Occurrence[];
}

interface Draft {
  id: string | null;
  code: string;
  title: string;
  description: string;
  frequency: Frequency;
  weekdays: number[];
  dayOfMonth: string;
  dueTime: string;
  assigneeUserIds: string[];
  completionRule: CompletionRule;
  checklist: ChecklistItem[];
}

const FREQ_LABEL: Record<Frequency, string> = {
  DAILY: 'Dnevno',
  WEEKLY: 'Sedmično',
  MONTHLY: 'Mjesečno',
};

const WEEKDAYS: Array<[number, string, string]> = [
  [1, 'Pon', 'Ponedjeljak'],
  [2, 'Uto', 'Utorak'],
  [3, 'Sri', 'Srijeda'],
  [4, 'Čet', 'Četvrtak'],
  [5, 'Pet', 'Petak'],
  [6, 'Sub', 'Subota'],
  [7, 'Ned', 'Nedjelja'],
];

const EMPTY_DRAFT: Draft = {
  id: null,
  code: '',
  title: '',
  description: '',
  frequency: 'DAILY',
  weekdays: [],
  dayOfMonth: '1',
  dueTime: '09:00',
  assigneeUserIds: [],
  completionRule: 'ALL',
  checklist: [],
};

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function schedule(t: TemplateView): string {
  if (t.frequency === 'WEEKLY') {
    const days = WEEKDAYS.filter(([n]) => t.weekdays.includes(n)).map(([, s]) => s);
    return `Sedmično (${days.join(', ') || '—'}) u ${t.dueTime}`;
  }
  if (t.frequency === 'MONTHLY') return `Mjesečno, ${t.dayOfMonth ?? '—'}. u ${t.dueTime}`;
  return `Dnevno u ${t.dueTime}`;
}

export function RecurringTasks({ users }: { users: UserOption[] }) {
  const [templates, setTemplates] = useState<TemplateView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftKey, setDraftKey] = useState(0);
  const [deactivate, setDeactivate] = useState<TemplateView | null>(null);
  const [runDate, setRunDate] = useState(() => isoDay(new Date()));
  const [logFor, setLogFor] = useState<TemplateView | null>(null);

  const load = useCallback(() => {
    api<{ templates: TemplateView[] }>('GET', '/api/v1/tasks/recurring/templates')
      .then((r) => {
        setTemplates(r.templates);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await fn());
      load();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const edit = (d: Draft) => {
    setDraft(d);
    setDraftKey((k) => k + 1);
  };

  const draftBlocked = (d: Draft): string | null => {
    if (d.code.trim().length < 2) return 'Šifra mora imati barem 2 znaka.';
    if (!d.title.trim()) return 'Upišite naslov.';
    if (d.frequency === 'WEEKLY' && d.weekdays.length === 0) return 'Odaberite dane u sedmici.';
    if (d.frequency === 'MONTHLY') {
      const n = Number(d.dayOfMonth);
      if (!Number.isInteger(n) || n < 1 || n > 31) return 'Dan u mjesecu mora biti 1–31.';
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.dueTime)) return 'Upišite vrijeme roka (HH:MM).';
    if (d.assigneeUserIds.length === 0) return 'Odaberite barem jednog izvršioca.';
    return null;
  };

  const columns: Array<Column<TemplateView>> = [
    {
      key: 'title',
      header: 'Predložak',
      render: (t) => (
        <span>
          {t.title}
          <span className="muted mono" style={{ display: 'block', fontSize: 11.5 }}>
            {t.code}
          </span>
        </span>
      ),
      text: (t) => `${t.title} ${t.code}`,
    },
    { key: 'sched', header: 'Raspored', render: (t) => schedule(t), text: (t) => schedule(t) },
    {
      key: 'who',
      header: 'Izvršioci',
      render: (t) => (
        <span title={t.assigneeUserIds.map((id) => userName(users, id)).join(', ')}>
          {t.assigneeUserIds.length} · {RULE_LABEL[t.completionRule]}
        </span>
      ),
      text: (t) => t.assigneeUserIds.map((id) => userName(users, id)).join(' '),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) =>
        t.active ? (
          <span className="badge badge-ok">Aktivan</span>
        ) : (
          <span className="badge">Neaktivan</span>
        ),
      text: (t) => (t.active ? 'Aktivan' : 'Neaktivan'),
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (t) => (
        <span className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" className="btn btn-sm" onClick={() => setLogFor(t)}>
            Dnevnik
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() =>
              edit({
                id: t.id,
                code: t.code,
                title: t.title,
                description: t.description ?? '',
                frequency: t.frequency,
                weekdays: t.weekdays,
                dayOfMonth: String(t.dayOfMonth ?? 1),
                dueTime: t.dueTime,
                assigneeUserIds: t.assigneeUserIds,
                completionRule: t.completionRule,
                checklist: t.checklist,
              })
            }
          >
            Uredi
          </button>
          {t.active ? (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={busy}
              onClick={() => setDeactivate(t)}
            >
              Deaktiviraj
            </button>
          ) : null}
        </span>
      ),
      text: () => '',
    },
  ];

  const blocked = draft ? draftBlocked(draft) : null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <h2>Periodični zadaci</h2>
        <button type="button" className="btn btn-sm" onClick={() => edit({ ...EMPTY_DRAFT })}>
          Novi predložak
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        Otvaranje/zatvaranje prodavnice, provjere smjene, HACCP i ZNR obilasci — zadaci se generišu
        automatski svaki sat; ovdje ih možete generisati i ručno (ponovljeno generisanje ne pravi
        duplikate).
      </p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        <input
          id="rec-run-date"
          className="input"
          type="date"
          aria-label="Datum generisanja"
          style={{ maxWidth: 170 }}
          value={runDate}
          onChange={(e) => setRunDate(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy || !runDate}
          onClick={() =>
            void run(async () => {
              const r = await api<{
                date: string;
                created: number;
                existing: number;
                skipped: string[];
              }>('POST', '/api/v1/tasks/recurring/run', { date: runDate });
              return `Generisano za ${r.date}: kreirano ${r.created}, već postoji ${r.existing}${
                r.skipped.length > 0 ? `, preskočeno: ${r.skipped.join(', ')}` : ''
              }.`;
            })
          }
        >
          Generiši za datum
        </button>
      </div>

      {templates === null ? (
        error ? null : (
          <LoadingState text="Učitavanje predložaka…" />
        )
      ) : (
        <DataTable
          columns={columns}
          rows={templates}
          rowKey={(t) => t.id}
          searchPlaceholder="Pretraga predložaka…"
          emptyText="Nema periodičnih zadataka. Kreirajte prvi predložak."
        />
      )}

      {draft ? (
        <form
          key={draftKey}
          style={{ marginTop: 14, display: 'grid', gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (blocked) return;
            const d = draft;
            void run(async () => {
              await api('POST', '/api/v1/tasks/recurring/templates', {
                code: d.code.trim(),
                title: d.title.trim(),
                ...(d.description.trim() ? { description: d.description.trim() } : {}),
                frequency: d.frequency,
                ...(d.frequency === 'WEEKLY'
                  ? { weekdays: [...d.weekdays].sort((a, b) => a - b) }
                  : {}),
                ...(d.frequency === 'MONTHLY' ? { dayOfMonth: Number(d.dayOfMonth) } : {}),
                dueTime: d.dueTime,
                assigneeUserIds: d.assigneeUserIds,
                completionRule: d.completionRule,
                checklist: d.checklist,
              });
              setDraft(null);
              return d.id ? 'Predložak je ažuriran.' : 'Predložak je kreiran.';
            });
          }}
        >
          <h3 style={{ marginBottom: 0 }}>{draft.id ? 'Uredi predložak' : 'Novi predložak'}</h3>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <input
              className="input mono"
              style={{ maxWidth: 180 }}
              placeholder="Šifra (npr. OPEN-STORE)"
              aria-label="Šifra predloška"
              maxLength={40}
              readOnly={draft.id !== null}
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              required
            />
            <input
              className="input"
              style={{ maxWidth: 340 }}
              placeholder="Naslov"
              aria-label="Naslov predloška"
              maxLength={300}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              required
            />
          </div>
          <input
            className="input"
            placeholder="Opis (opcionalno)"
            aria-label="Opis predloška"
            maxLength={2000}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="label" htmlFor="rec-freq">
                Učestalost
              </label>
              <select
                id="rec-freq"
                className="select"
                value={draft.frequency}
                onChange={(e) => setDraft({ ...draft, frequency: e.target.value as Frequency })}
              >
                {(Object.keys(FREQ_LABEL) as Frequency[]).map((f) => (
                  <option key={f} value={f}>
                    {FREQ_LABEL[f]}
                  </option>
                ))}
              </select>
            </div>
            {draft.frequency === 'MONTHLY' ? (
              <div>
                <label className="label" htmlFor="rec-dom">
                  Dan u mjesecu
                </label>
                <input
                  id="rec-dom"
                  className="input"
                  type="number"
                  min={1}
                  max={31}
                  style={{ maxWidth: 100 }}
                  value={draft.dayOfMonth}
                  onChange={(e) => setDraft({ ...draft, dayOfMonth: e.target.value })}
                />
              </div>
            ) : null}
            <div>
              <label className="label" htmlFor="rec-time">
                Rok (vrijeme)
              </label>
              <input
                id="rec-time"
                className="input"
                type="time"
                style={{ maxWidth: 130 }}
                value={draft.dueTime}
                onChange={(e) => setDraft({ ...draft, dueTime: e.target.value })}
              />
            </div>
          </div>
          {draft.frequency === 'WEEKLY' ? (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label">Dani u sedmici</legend>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {WEEKDAYS.map(([n, short, long]) => (
                  <button
                    key={n}
                    type="button"
                    className="chip"
                    aria-pressed={draft.weekdays.includes(n)}
                    aria-label={long}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        weekdays: draft.weekdays.includes(n)
                          ? draft.weekdays.filter((w) => w !== n)
                          : [...draft.weekdays, n],
                      })
                    }
                  >
                    {short}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
          <AssigneePicker
            users={users}
            value={draft.assigneeUserIds}
            onChange={(ids) => setDraft({ ...draft, assigneeUserIds: ids })}
            idPrefix="rec"
          />
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">Pravilo završetka</legend>
            {(['ALL', 'ANY'] as const).map((r) => (
              <label key={r} className="row" style={{ gap: 6, minHeight: 32 }}>
                <input
                  type="radio"
                  name="rec-rule"
                  checked={draft.completionRule === r}
                  onChange={() => setDraft({ ...draft, completionRule: r })}
                />
                {RULE_LABEL[r]}
              </label>
            ))}
          </fieldset>
          <ChecklistBuilder
            items={draft.checklist}
            onChange={(checklist) => setDraft({ ...draft, checklist })}
            idPrefix="rec"
          />
          <p className="muted" style={{ fontSize: 12 }}>
            Izmjene važe za buduće generisane zadatke; već kreirani zadaci se ne mijenjaju.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="submit" disabled={busy || blocked !== null}>
              Sačuvaj predložak
            </button>
            <button type="button" className="btn" onClick={() => setDraft(null)} disabled={busy}>
              Odustani
            </button>
            {blocked ? (
              <span className="muted" style={{ fontSize: 12.5 }}>
                {blocked}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}

      {logFor ? (
        <TemplateLog template={logFor} users={users} onClose={() => setLogFor(null)} />
      ) : null}

      {deactivate ? (
        <ConfirmDialog
          open
          title="Deaktivacija predloška"
          consequence="Novi zadaci po ovom predlošku se više neće generisati. Već kreirani zadaci i dnevnik ostaju (auditirano)."
          confirmLabel="Deaktiviraj"
          danger
          busy={busy}
          onConfirm={() =>
            void run(async () => {
              await api(
                'POST',
                `/api/v1/tasks/recurring/templates/${deactivate.id}/deactivate`,
                {},
              );
              setDeactivate(null);
              return 'Predložak je deaktiviran.';
            })
          }
          onCancel={() => setDeactivate(null)}
        >
          <div className="fact">
            <span>Predložak</span>
            <span style={{ textAlign: 'right' }}>{deactivate.title}</span>
          </div>
          <div className="fact">
            <span>Raspored</span>
            <span>{schedule(deactivate)}</span>
          </div>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/** Dnevnik izvršenja: datumi × izvršioci, propušteno crveno. */
function TemplateLog({
  template,
  users,
  onClose,
}: {
  template: TemplateView;
  users: UserOption[];
  onClose: () => void;
}) {
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 6 * 86_400_000)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [log, setLog] = useState<LogView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    api<LogView>(
      'GET',
      `/api/v1/tasks/recurring/templates/${template.id}/log?from=${from}&to=${to}`,
    )
      .then(setLog)
      .catch((e: unknown) => {
        setLog(null);
        setError(errorText(e));
      })
      .finally(() => setLoading(false));
  }, [template.id, from, to]);
  useEffect(load, [load]);

  const people = log
    ? [
        ...new Set([
          ...log.template.assigneeUserIds,
          ...log.occurrences.flatMap((o) => o.assignees.map((a) => a.userId)),
        ]),
      ]
    : [];

  const cell = (o: Occurrence, userId: string) => {
    const a = o.assignees.find((x) => x.userId === userId);
    if (!a) return <span className="muted">—</span>;
    if (a.status === 'DONE') {
      const failed = (a.results ?? []).filter((r) => !r.ok);
      return (
        <span>
          <span style={{ color: 'var(--color-ok)' }}>
            <span aria-hidden="true">✓ </span>
            {fmtTime(a.completedAt)}
          </span>
          {failed.map((r) => (
            <span
              key={r.label}
              style={{ display: 'block', color: 'var(--color-danger)', fontSize: 12 }}
            >
              ✗ {r.label}
              {r.value ? ` (${r.value})` : ''}
              {r.note ? ` — ${r.note}` : ''}
            </span>
          ))}
          {a.note ? (
            <span className="muted" style={{ display: 'block', fontSize: 12 }}>
              {a.note}
            </span>
          ) : null}
        </span>
      );
    }
    if (o.status !== 'OPEN') return <span className="muted">— (zatvoreno)</span>;
    if (o.missed) {
      return (
        <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
          <span aria-hidden="true">✗ </span>Propušteno
        </span>
      );
    }
    return (
      <span>
        <span aria-hidden="true">○ </span>Otvoreno
      </span>
    );
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Dnevnik: {template.title}</h3>
        <button type="button" className="btn btn-sm" onClick={onClose}>
          Zatvori dnevnik
        </button>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', margin: '8px 0' }}>
        <input
          className="input"
          type="date"
          aria-label="Od datuma"
          style={{ maxWidth: 170 }}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          className="input"
          type="date"
          aria-label="Do datuma"
          style={{ maxWidth: 170 }}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      {error ? (
        <ErrorState text={error} />
      ) : loading || log === null ? (
        <LoadingState text="Učitavanje dnevnika…" />
      ) : log.occurrences.length === 0 ? (
        <EmptyState text="Nema generisanih zadataka u odabranom periodu." />
      ) : (
        <div className="scroll-x">
          <table className="table">
            <caption className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
              ✓ završeno (vrijeme) · ○ otvoreno · ✗ propušteno ili stavka „Nije OK”
            </caption>
            <thead>
              <tr>
                <th scope="col">Datum</th>
                {people.map((id) => (
                  <th key={id} scope="col">
                    {userName(users, id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.occurrences.map((o) => (
                <tr key={o.taskId} className={o.missed ? 'cell-missed' : undefined}>
                  <th
                    scope="row"
                    style={{
                      whiteSpace: 'nowrap',
                      textTransform: 'none',
                      letterSpacing: 'normal',
                      fontSize: 13,
                      color: 'var(--color-text)',
                      background: 'transparent',
                    }}
                  >
                    <span className="mono">{o.date}</span>
                    <span style={{ display: 'block', marginTop: 2 }}>
                      {o.missed ? (
                        <span className="badge badge-danger">Propušteno</span>
                      ) : o.status === 'DONE' ? (
                        <span className="badge badge-ok">Završeno {fmtTime(o.completedAt)}</span>
                      ) : o.status === 'OPEN' ? (
                        <span className="badge badge-info">Otvoreno</span>
                      ) : (
                        <span className="badge">{o.status}</span>
                      )}
                    </span>
                  </th>
                  {people.map((id) => (
                    <td key={id}>{cell(o, id)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

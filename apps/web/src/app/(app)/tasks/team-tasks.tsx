'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { ErrorState, LoadingState } from '../../../components/ui';

/**
 * WF-013 (Sprint 246): timski zadaci — "Moj dio" (checklista po izvršiocu),
 * kreiranje timskog zadatka i dijeljeni pickeri. Server je autoritativan:
 * pravila (obavezne stavke, napomena za "Nije OK", pravilo završetka,
 * idempotentnost) provjerava API; UI samo pomaže i objašnjava.
 */

export interface UserOption {
  id: string;
  displayName: string;
  email?: string;
}

export interface ChecklistItem {
  label: string;
  required: boolean;
}

export interface ChecklistAnswer {
  label: string;
  ok: boolean;
  value?: string;
  note?: string;
}

export type CompletionRule = 'ALL' | 'ANY';

export interface TeamAssignee {
  userId: string;
  status: string;
  completedAt: string | null;
  note: string | null;
  results: ChecklistAnswer[] | null;
}

export interface TeamTaskView {
  id: string;
  title: string;
  description: string | null;
  status: string;
  completionRule: CompletionRule;
  dueAt: string | null;
  completedAt: string | null;
  occurrenceDate: string | null;
  templateId: string | null;
  checklist: ChecklistItem[];
  assignees: TeamAssignee[];
}

export const RULE_LABEL: Record<CompletionRule, string> = {
  ALL: 'Svi moraju završiti',
  ANY: 'Dovoljan jedan',
};

export function userName(users: UserOption[], id: string): string {
  return users.find((u) => u.id === id)?.displayName ?? `Korisnik ${id.slice(0, 8)}`;
}

export function fmtTime(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' })
    : '';
}

export function fmtDateTime(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString('bs-BA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Višestruki izbor izvršilaca. Popis korisnika traži IAM pravo; bez njega
 * se nudi unos ID-jeva (server i dalje provjerava da su aktivni korisnici).
 */
export function AssigneePicker({
  users,
  value,
  onChange,
  idPrefix,
}: {
  users: UserOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  idPrefix: string;
}) {
  const [q, setQ] = useState('');
  const [raw, setRaw] = useState(value.join('\n'));

  if (users.length === 0) {
    return (
      <div>
        <label className="label" htmlFor={`${idPrefix}-ids`}>
          Izvršioci (ID korisnika, jedan po redu)
        </label>
        <textarea
          id={`${idPrefix}-ids`}
          className="input"
          rows={3}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            onChange(
              e.target.value
                .split(/[\s,;]+/)
                .map((s) => s.trim())
                .filter((s) => UUID.test(s)),
            );
          }}
        />
        <p className="muted" style={{ fontSize: 12 }}>
          Popis korisnika nije dostupan (potrebno pravo iam.user.manage). Prepoznato ID-jeva:{' '}
          {value.length}.
        </p>
      </div>
    );
  }

  const shown = users.filter(
    (u) => !q || `${u.displayName} ${u.email ?? ''}`.toLowerCase().includes(q.toLowerCase()),
  );
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="label">Izvršioci ({value.length} odabrano)</legend>
      {users.length > 8 ? (
        <input
          className="input"
          style={{ marginBottom: 6 }}
          placeholder="Pretraga korisnika…"
          aria-label="Pretraga korisnika"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      ) : null}
      <div className="pick-list">
        {shown.length === 0 ? (
          <span className="muted">Nema korisnika za prikaz.</span>
        ) : (
          shown.map((u) => (
            <label key={u.id}>
              <input type="checkbox" checked={value.includes(u.id)} onChange={() => toggle(u.id)} />
              {u.displayName}
            </label>
          ))
        )}
      </div>
    </fieldset>
  );
}

/** Uređivač checkliste: stavke s oznakom i "obavezno". */
export function ChecklistBuilder({
  items,
  onChange,
  idPrefix,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  idPrefix: string;
}) {
  const [label, setLabel] = useState('');
  const trimmed = label.trim();
  const duplicate = items.some((i) => i.label === trimmed);
  const add = () => {
    if (!trimmed || duplicate || items.length >= 50) return;
    onChange([...items, { label: trimmed, required: true }]);
    setLabel('');
  };
  return (
    <div>
      <span className="label">Checklista ({items.length}/50)</span>
      {items.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5 }}>
          Bez checkliste — izvršilac završava samo uz napomenu.
        </p>
      ) : (
        <ol style={{ paddingLeft: 20, margin: '4px 0 8px' }}>
          {items.map((it, idx) => (
            <li key={it.label} style={{ marginBottom: 4 }}>
              <span className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 140 }}>{it.label}</span>
                <label className="row" style={{ gap: 4, fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={it.required}
                    onChange={(e) =>
                      onChange(
                        items.map((x, i) => (i === idx ? { ...x, required: e.target.checked } : x)),
                      )
                    }
                  />
                  Obavezno
                </label>
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label={`Ukloni stavku ${it.label}`}
                  onClick={() => onChange(items.filter((_, i) => i !== idx))}
                >
                  Ukloni
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input
          id={`${idPrefix}-item`}
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Nova stavka (npr. Temperatura vitrine)"
          aria-label="Nova stavka checkliste"
          maxLength={200}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-sm"
          disabled={!trimmed || duplicate || items.length >= 50}
          onClick={add}
        >
          Dodaj stavku
        </button>
      </div>
      {duplicate ? (
        <p className="muted" style={{ fontSize: 12 }}>
          Stavka s tim nazivom već postoji.
        </p>
      ) : null}
    </div>
  );
}

/** Napredak po osobama: x/y završilo + status svakog izvršioca. */
export function TeamProgress({ view, users }: { view: TeamTaskView; users: UserOption[] }) {
  const done = view.assignees.filter((a) => a.status === 'DONE').length;
  return (
    <div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className={`badge ${done === view.assignees.length ? 'badge-ok' : 'badge-info'}`}>
          {done}/{view.assignees.length} završilo
        </span>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {RULE_LABEL[view.completionRule]}
        </span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
        {view.assignees.map((a) => (
          <li key={a.userId} style={{ fontSize: 13.5, marginBottom: 2 }}>
            <span aria-hidden="true">{a.status === 'DONE' ? '✓ ' : '○ '}</span>
            {userName(users, a.userId)}{' '}
            <span className="muted">
              {a.status === 'DONE' ? `— završeno ${fmtDateTime(a.completedAt)}` : '— otvoreno'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Answer {
  ok: boolean | null;
  value: string;
  note: string;
}

/**
 * "Moj dio" — završetak vlastitog dijela timskog zadatka. Velike OK / Nije OK
 * tipke (telefon), napomena obavezna za "Nije OK"; server konačno validira.
 */
export function MyPartPanel({
  taskId,
  users,
  onCompleted,
  onClose,
}: {
  taskId: string;
  users: UserOption[];
  onCompleted: (message: string) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<TeamTaskView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setView(null);
    setLoadError(null);
    setAnswers({});
    setNote('');
    setError(null);
    api<TeamTaskView>('GET', `/api/v1/tasks/${taskId}/mine`)
      .then(setView)
      .catch((e: unknown) => setLoadError(errorText(e)));
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [taskId]);

  const answer = (label: string): Answer => answers[label] ?? { ok: null, value: '', note: '' };
  const patch = (label: string, p: Partial<Answer>) =>
    setAnswers((prev) => ({ ...prev, [label]: { ...answer(label), ...p } }));

  const blockers = useMemo(() => {
    if (!view) return [];
    const out: string[] = [];
    for (const item of view.checklist) {
      const a = answers[item.label];
      if (item.required && (!a || a.ok === null)) out.push(`Označite stavku „${item.label}”.`);
      if (a && a.ok === false && !a.note.trim()) {
        out.push(`Za „${item.label}” (Nije OK) upišite napomenu — šta je urađeno.`);
      }
    }
    return out;
  }, [view, answers]);

  const answered = view ? view.checklist.filter((i) => answers[i.label]?.ok != null).length : 0;

  async function submit() {
    if (!view) return;
    setBusy(true);
    setError(null);
    try {
      const results: ChecklistAnswer[] = view.checklist
        .filter((i) => answers[i.label]?.ok != null)
        .map((i) => {
          const a = answers[i.label]!;
          return {
            label: i.label,
            ok: a.ok === true,
            ...(a.value.trim() ? { value: a.value.trim() } : {}),
            ...(a.note.trim() ? { note: a.note.trim() } : {}),
          };
        });
      const r = await api<TeamTaskView & { duplicate: boolean }>(
        'POST',
        `/api/v1/tasks/${taskId}/complete-mine`,
        {
          ...(results.length > 0 ? { results } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      );
      onCompleted(
        r.duplicate
          ? 'Vaš dio je već ranije bio završen — ništa nije promijenjeno.'
          : r.status === 'DONE'
            ? 'Vaš dio je završen — zadatak je zatvoren.'
            : 'Vaš dio je završen.',
      );
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" ref={ref} style={{ marginBottom: 16 }} aria-live="polite">
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <h2 style={{ marginBottom: 4 }}>Moj dio{view ? `: ${view.title}` : ''}</h2>
        <button type="button" className="btn btn-sm" onClick={onClose} disabled={busy}>
          Zatvori
        </button>
      </div>
      {loadError ? (
        <ErrorState text={loadError} />
      ) : view === null ? (
        <LoadingState text="Učitavanje zadatka…" />
      ) : (
        <>
          {view.description ? <p style={{ marginTop: 0 }}>{view.description}</p> : null}
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Rok: {fmtDateTime(view.dueAt)}
          </p>
          <TeamProgress view={view} users={users} />
          {view.status !== 'OPEN' ? (
            <div className="alert alert-warn" role="status">
              Zadatak je već zatvoren ({view.status}) — nije potrebno ništa više unositi.
            </div>
          ) : (
            <form
              style={{ marginTop: 12 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (blockers.length === 0) void submit();
              }}
            >
              {view.checklist.length > 0 ? (
                <>
                  <h3 style={{ marginBottom: 8 }}>
                    Checklista ({answered}/{view.checklist.length})
                  </h3>
                  {view.checklist.map((item) => {
                    const a = answer(item.label);
                    const slug = `${taskId}-${view.checklist.indexOf(item)}`;
                    return (
                      <div
                        key={item.label}
                        className={`check-item ${a.ok === false ? 'check-item-fail' : ''}`}
                        role="group"
                        aria-label={item.label}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>
                          {item.label}
                          {item.required ? null : (
                            <span className="muted" style={{ fontWeight: 400 }}>
                              {' '}
                              (opcionalno)
                            </span>
                          )}
                        </div>
                        <div className="choice-row">
                          <button
                            type="button"
                            className="choice choice-ok"
                            aria-pressed={a.ok === true}
                            onClick={() => patch(item.label, { ok: a.ok === true ? null : true })}
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            className="choice choice-fail"
                            aria-pressed={a.ok === false}
                            onClick={() => patch(item.label, { ok: a.ok === false ? null : false })}
                          >
                            Nije OK
                          </button>
                        </div>
                        {a.ok !== null ? (
                          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                            <input
                              className="input"
                              aria-label={`Vrijednost za ${item.label} (opcionalno)`}
                              placeholder="Vrijednost (opcionalno, npr. 4 °C)"
                              maxLength={200}
                              value={a.value}
                              onChange={(e) => patch(item.label, { value: e.target.value })}
                            />
                            <input
                              id={`${slug}-note`}
                              className="input"
                              aria-label={
                                a.ok === false
                                  ? `Napomena za ${item.label} (obavezno)`
                                  : `Napomena za ${item.label}`
                              }
                              aria-required={a.ok === false}
                              aria-invalid={a.ok === false && !a.note.trim()}
                              placeholder={
                                a.ok === false
                                  ? 'Napomena — šta je urađeno (obavezno)'
                                  : 'Napomena (opcionalno)'
                              }
                              maxLength={500}
                              value={a.note}
                              onChange={(e) => patch(item.label, { note: e.target.value })}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </>
              ) : null}
              <label className="label" htmlFor={`${taskId}-overall-note`}>
                Napomena (opcionalno)
              </label>
              <textarea
                id={`${taskId}-overall-note`}
                className="input"
                rows={2}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              {blockers.length > 0 ? (
                <ul className="muted" style={{ fontSize: 12.5, paddingLeft: 18 }}>
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
              {error ? <ErrorState text={error} /> : null}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', minHeight: 48, marginTop: 10, fontSize: 16 }}
                disabled={busy || blockers.length > 0}
              >
                {busy ? 'Šaljem…' : 'Završi moj dio'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

/** "Novi timski zadatak" (task.manage). */
export function TeamTaskForm({
  users,
  onCreated,
}: {
  users: UserOption[];
  onCreated: (message: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [rule, setRule] = useState<CompletionRule>('ALL');
  const [dueAt, setDueAt] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const blocked = !title.trim()
    ? 'Upišite naslov.'
    : assignees.length === 0
      ? 'Odaberite barem jednog izvršioca.'
      : assignees.length > 50
        ? 'Najviše 50 izvršilaca.'
        : null;

  return (
    <form
      key={formKey}
      onSubmit={(e) => {
        e.preventDefault();
        if (blocked) return;
        setBusy(true);
        setError(null);
        api('POST', '/api/v1/tasks/team', {
          title: title.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          assigneeUserIds: assignees,
          completionRule: rule,
          ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
          ...(checklist.length > 0 ? { checklist } : {}),
        })
          .then(() => {
            setTitle('');
            setDescription('');
            setAssignees([]);
            setRule('ALL');
            setDueAt('');
            setChecklist([]);
            setFormKey((k) => k + 1);
            onCreated('Timski zadatak je kreiran i izvršioci su obaviješteni.');
          })
          .catch((err: unknown) => setError(errorText(err)))
          .finally(() => setBusy(false));
      }}
      style={{ display: 'grid', gap: 10 }}
    >
      <input
        className="input"
        placeholder="Naslov (npr. Otvaranje prodavnice)"
        aria-label="Naslov timskog zadatka"
        maxLength={300}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <input
        className="input"
        placeholder="Opis (opcionalno)"
        aria-label="Opis timskog zadatka"
        maxLength={2000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <AssigneePicker users={users} value={assignees} onChange={setAssignees} idPrefix="team" />
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Pravilo završetka</legend>
          {(['ALL', 'ANY'] as const).map((r) => (
            <label key={r} className="row" style={{ gap: 6, minHeight: 32 }}>
              <input
                type="radio"
                name="team-rule"
                checked={rule === r}
                onChange={() => setRule(r)}
              />
              {RULE_LABEL[r]}
            </label>
          ))}
        </fieldset>
        <div>
          <label className="label" htmlFor="team-due">
            Rok
          </label>
          <input
            id="team-due"
            className="input"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
      </div>
      <ChecklistBuilder items={checklist} onChange={setChecklist} idPrefix="team" />
      {error ? <ErrorState text={error} /> : null}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-primary" type="submit" disabled={busy || blocked !== null}>
          {busy ? 'Kreiram…' : 'Kreiraj timski zadatak'}
        </button>
        {blocked ? (
          <span className="muted" style={{ fontSize: 12.5 }}>
            {blocked}
          </span>
        ) : null}
      </div>
    </form>
  );
}

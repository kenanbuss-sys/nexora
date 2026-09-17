'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorText } from '../../../lib/api';
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
 * Zadaci i odobrenja (Sprint 228): vlastiti/dodijeljeni zadaci s rokovima
 * i statusima, veza na poslovni zapis (npr. projekat) i odobri/odbij nad
 * postojećim approval domenom — SoD (zabrana samoodobravanja) i audit su
 * na serveru; UI samo prikazuje dozvoljene radnje.
 */

interface TaskView {
  id: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  assigneeUserId: string | null;
  dueAt: string | null;
  relatedObjectType: string | null;
  relatedObjectId: string | null;
  createdAt: string;
}

interface ApprovalView {
  id: string;
  title: string;
  status: string;
  subjectObjectType: string;
  subjectObjectId: string;
}

interface UserOption {
  id: string;
  displayName: string;
}

const TASK_BADGE: Record<TaskView['status'], [string, string]> = {
  OPEN: ['Otvoren', ''],
  DONE: ['Završen', 'badge-ok'],
  CANCELLED: ['Otkazan', 'badge-danger'],
};

const RELATED_LABEL: Record<string, string> = {
  prj_project: 'Projekat',
  sales_order: 'Narudžba',
  purchase_order: 'Narudžbenica',
  crm_account: 'Kupac',
};

export default function TasksPage() {
  const { can, session } = useApp();
  const canManage = can('task.manage');
  const canApprove = can('approval.act');

  const [tasks, setTasks] = useState<TaskView[] | null>(null);
  const [approvals, setApprovals] = useState<ApprovalView[] | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'DONE' | 'ALL'>('OPEN');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [assignee, setAssignee] = useState('');
  const [decide, setDecide] = useState<{
    approval: ApprovalView;
    decision: 'approve' | 'reject';
  } | null>(null);

  const load = useCallback(() => {
    api<{ tasks: TaskView[] }>('GET', `/api/v1/tasks?status=${statusFilter}`)
      .then((r) => {
        setTasks(r.tasks);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    if (canApprove) {
      api<{ approvals: ApprovalView[] }>('GET', '/api/v1/approvals/pending')
        .then((r) => setApprovals(r.approvals))
        .catch(() => setApprovals([]));
    }
  }, [statusFilter, canApprove]);
  useEffect(load, [load]);

  useEffect(() => {
    // Dodjela drugom korisniku traži IAM pravo — bez njega select se krije.
    api<{ users: UserOption[] }>('GET', '/api/v1/users')
      .then((r) => setUsers(r.users))
      .catch(() => setUsers([]));
  }, []);

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

  const overdue = (t: TaskView) =>
    t.status === 'OPEN' && t.dueAt !== null && new Date(t.dueAt).getTime() < Date.now();

  const columns: Array<Column<TaskView>> = [
    {
      key: 'title',
      header: 'Zadatak',
      render: (t) => (
        <span>
          {t.title}
          {t.description ? (
            <span className="muted" style={{ display: 'block', fontSize: 12 }}>
              {t.description}
            </span>
          ) : null}
        </span>
      ),
      text: (t) => `${t.title} ${t.description ?? ''}`,
    },
    {
      key: 'due',
      header: 'Rok',
      render: (t) =>
        t.dueAt ? (
          <span className="mono" style={overdue(t) ? { color: 'var(--color-danger)' } : undefined}>
            {new Date(t.dueAt).toLocaleDateString()}
            {overdue(t) ? ' — kasni' : ''}
          </span>
        ) : (
          <span className="muted">—</span>
        ),
      text: (t) => (t.dueAt ? new Date(t.dueAt).toLocaleDateString() : ''),
    },
    {
      key: 'related',
      header: 'Povezano',
      render: (t) =>
        t.relatedObjectType === 'prj_project' ? (
          <Link href="/projects">Projekat</Link>
        ) : t.relatedObjectType ? (
          <span className="muted">{RELATED_LABEL[t.relatedObjectType] ?? t.relatedObjectType}</span>
        ) : (
          <span className="muted">—</span>
        ),
      text: (t) => t.relatedObjectType ?? '',
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (t) => (
        <span className={`badge ${TASK_BADGE[t.status][1]}`}>{TASK_BADGE[t.status][0]}</span>
      ),
      text: (t) => TASK_BADGE[t.status][0],
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (t) =>
        t.status === 'OPEN' && canManage ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() =>
              void run(
                () => api('POST', `/api/v1/tasks/${t.id}/complete`, {}),
                'Zadatak je završen.',
              )
            }
          >
            Završi
          </button>
        ) : null,
      text: () => '',
    },
  ];

  return (
    <main className="page">
      <h1>Zadaci i odobrenja</h1>
      <p className="page-sub">
        Vaši i nedodijeljeni zadaci s rokovima, plus odluke koje čekaju vas — vlastite zahtjeve ne
        možete odobriti (razdvajanje dužnosti na serveru).
      </p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div className="card">
          <h2>Moji zadaci</h2>
          <div className="row" style={{ marginBottom: 8 }}>
            <select
              className="select"
              style={{ maxWidth: 180 }}
              aria-label="Filter statusa zadatka"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'OPEN' | 'DONE' | 'ALL')}
            >
              <option value="OPEN">Otvoreni</option>
              <option value="DONE">Završeni</option>
              <option value="ALL">Svi</option>
            </select>
          </div>
          {tasks === null ? (
            <LoadingState text="Učitavanje zadataka…" />
          ) : (
            <DataTable
              columns={columns}
              rows={tasks}
              rowKey={(t) => t.id}
              searchPlaceholder="Pretraga zadataka…"
              emptyText="Nema zadataka za prikaz."
            />
          )}

          {canManage ? (
            <form
              style={{ marginTop: 14 }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api('POST', '/api/v1/tasks', {
                    title,
                    ...(description ? { description } : {}),
                    ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
                    ...(assignee ? { assigneeUserId: assignee } : {}),
                  });
                  setTitle('');
                  setDescription('');
                  setDueAt('');
                  setAssignee('');
                }, 'Zadatak je kreiran.');
              }}
            >
              <h3 style={{ marginBottom: 6 }}>Novi zadatak</h3>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <input
                  className="input"
                  style={{ maxWidth: 260 }}
                  placeholder="Naslov zadatka"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
                <input
                  className="input"
                  style={{ maxWidth: 170 }}
                  type="date"
                  aria-label="Rok"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
                {users.length > 0 ? (
                  <select
                    className="select"
                    style={{ maxWidth: 200 }}
                    aria-label="Dodijeli korisniku"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                  >
                    <option value="">Bez dodjele…</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <input
                  className="input"
                  style={{ maxWidth: 440 }}
                  placeholder="Opis (opcionalno)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                  Kreiraj zadatak
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <div className="card">
          <h2>Odobrenja na čekanju</h2>
          {!canApprove ? (
            <EmptyState text="Nemate pravo odlučivanja (approval.act)." />
          ) : approvals === null ? (
            <LoadingState text="Učitavanje odobrenja…" />
          ) : approvals.length === 0 ? (
            <EmptyState text="Nema zahtjeva koji čekaju vašu odluku." />
          ) : (
            approvals.map((a) => (
              <div key={a.id} className="row spread" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13.5 }}>
                  {a.title}
                  <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>
                    {a.subjectObjectType}
                  </span>
                </span>
                <span className="row">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busy}
                    onClick={() => setDecide({ approval: a, decision: 'approve' })}
                  >
                    Odobri
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={busy}
                    onClick={() => setDecide({ approval: a, decision: 'reject' })}
                  >
                    Odbij
                  </button>
                </span>
              </div>
            ))
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Prijavljeni: <span className="mono">{session.subject}</span> — vlastiti zahtjevi se ne
            prikazuju i ne mogu se odobriti.
          </p>
        </div>
      </div>

      {decide ? (
        <ConfirmDialog
          open
          title={decide.decision === 'approve' ? 'Odobravanje zahtjeva' : 'Odbijanje zahtjeva'}
          consequence={
            decide.decision === 'approve'
              ? 'Odluka je trajna i auditirana; zavisni tok se odmah nastavlja.'
              : 'Zahtjev se trajno odbija (auditirano); podnosilac može podnijeti novi.'
          }
          confirmLabel={decide.decision === 'approve' ? 'Odobri' : 'Odbij'}
          danger={decide.decision === 'reject'}
          busy={busy}
          onConfirm={() =>
            void run(
              async () => {
                await api('POST', `/api/v1/approvals/${decide.approval.id}/${decide.decision}`, {});
                setDecide(null);
              },
              decide.decision === 'approve' ? 'Zahtjev je odobren.' : 'Zahtjev je odbijen.',
            )
          }
          onCancel={() => setDecide(null)}
        >
          <div className="fact">
            <span>Zahtjev</span>
            <span style={{ textAlign: 'right' }}>{decide.approval.title}</span>
          </div>
          <div className="fact">
            <span>Vrsta</span>
            <span className="mono">{decide.approval.subjectObjectType}</span>
          </div>
        </ConfirmDialog>
      ) : null}
    </main>
  );
}

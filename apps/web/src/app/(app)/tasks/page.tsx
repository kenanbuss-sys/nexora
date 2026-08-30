'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface TaskView {
  id: string;
  title: string;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  assigneeUserId: string | null;
  dueAt: string | null;
}

interface ApprovalView {
  id: string;
  title: string;
  status: 'REQUESTED' | 'GRANTED' | 'REJECTED';
  subjectObjectType: string;
  subjectObjectId: string;
}

interface NotificationView {
  id: string;
  type: string;
  title: string;
  readAt: string | null;
  createdAt: string;
}

interface Inbox {
  tasks: TaskView[];
  approvals: ApprovalView[];
  notifications: NotificationView[];
}

export default function TasksPage() {
  const { can } = useApp();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Inbox>('GET', '/api/v1/inbox')
      .then((r) => {
        setInbox(r);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>, id: string) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      load();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="page">
      <h1>Inbox</h1>
      <p className="page-sub">Your tasks, approvals waiting on you, and notifications.</p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {!inbox && !error ? <div className="loading">Loading inbox…</div> : null}

      {inbox ? (
        <>
          <div className="card">
            <h2>My tasks</h2>
            {inbox.tasks.length === 0 ? (
              <div className="empty">No open tasks — all clear.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {inbox.tasks.map((t) => (
                    <tr key={t.id}>
                      <td>{t.title}</td>
                      <td>
                        <span className={`badge ${t.status === 'OPEN' ? 'badge-accent' : ''}`}>
                          {t.status}
                        </span>
                      </td>
                      <td>{t.dueAt ? new Date(t.dueAt).toLocaleDateString() : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {t.status === 'OPEN' && can('task.manage') ? (
                          <button
                            className="btn btn-sm"
                            disabled={busyId === t.id}
                            onClick={() =>
                              act(() => api('POST', `/api/v1/tasks/${t.id}/complete`), t.id)
                            }
                            type="button"
                          >
                            Complete
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>Approvals waiting on me</h2>
            {inbox.approvals.length === 0 ? (
              <div className="empty">Nothing waiting for your approval.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Subject</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {inbox.approvals.map((a) => (
                    <tr key={a.id}>
                      <td>{a.title}</td>
                      <td className="mono">
                        {a.subjectObjectType}/{a.subjectObjectId.slice(0, 8)}…
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {can('approval.act') ? (
                          <span className="row" style={{ justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={busyId === a.id}
                              onClick={() =>
                                act(() => api('POST', `/api/v1/approvals/${a.id}/approve`), a.id)
                              }
                              type="button"
                            >
                              Approve
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              disabled={busyId === a.id}
                              onClick={() =>
                                act(
                                  () =>
                                    api('POST', `/api/v1/approvals/${a.id}/reject`, {
                                      reason: 'Rejected from inbox',
                                    }),
                                  a.id,
                                )
                              }
                              type="button"
                            >
                              Reject
                            </button>
                          </span>
                        ) : (
                          <span className="muted">approval.act required</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>Notifications</h2>
            {inbox.notifications.length === 0 ? (
              <div className="empty">No notifications.</div>
            ) : (
              <table className="table">
                <tbody>
                  {inbox.notifications.map((n) => (
                    <tr key={n.id}>
                      <td style={{ width: 24 }}>{n.readAt ? '' : '•'}</td>
                      <td>
                        {n.title}
                        <div className="muted" style={{ fontSize: 12 }}>
                          {n.type} · {new Date(n.createdAt).toLocaleString()}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {!n.readAt ? (
                          <button
                            className="btn btn-sm"
                            disabled={busyId === n.id}
                            onClick={() =>
                              act(() => api('POST', `/api/v1/notifications/${n.id}/read`), n.id)
                            }
                            type="button"
                          >
                            Mark read
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface EmployeeView {
  id: string;
  employeeNumber: string;
  name: string;
  email: string | null;
  title: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  skills: string[];
}

export default function HrPage() {
  const { can } = useApp();
  const [employees, setEmployees] = useState<EmployeeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [skillsFor, setSkillsFor] = useState('');
  const [skillsInput, setSkillsInput] = useState('');

  const load = useCallback(() => {
    api<{ employees: EmployeeView[] }>('GET', '/api/v1/employees')
      .then((r) => {
        setEmployees(r.employees);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>, successText: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(successText);
      load();
    } catch (e: unknown) {
      setError(errorText(e));
      setNotice(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>People</h1>
      <p className="page-sub">
        Employee master with roles, skills for shop-floor assignment, and an audited lifecycle.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div className="card">
          <h2>Employees</h2>
          {employees === null ? <div className="loading">Loading…</div> : null}
          {employees && employees.length === 0 ? (
            <div className="empty">No employees yet.</div>
          ) : null}
          {(employees ?? []).map((e) => (
            <div key={e.id} className="row spread" style={{ marginBottom: 8 }}>
              <span>
                <strong className="mono">{e.employeeNumber}</strong> {e.name}{' '}
                <span className="muted" style={{ fontSize: 12 }}>
                  {e.title ?? ''}
                  {e.skills.length > 0 ? ` · ${e.skills.join(', ')}` : ''}
                </span>
              </span>
              <span>
                <span className={`badge ${e.status === 'ACTIVE' ? 'badge-ok' : ''}`}>
                  {e.status}
                </span>{' '}
                {can('hcm.manage') ? (
                  <>
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      type="button"
                      onClick={() => {
                        setSkillsFor(e.id);
                        setSkillsInput(e.skills.join(', '));
                      }}
                    >
                      Skills
                    </button>{' '}
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        run(
                          () =>
                            api('POST', `/api/v1/employees/${e.id}/status`, {
                              status: e.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                            }),
                          'Employee status updated.',
                        )
                      }
                    >
                      {e.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  </>
                ) : null}
              </span>
            </div>
          ))}
          {skillsFor ? (
            <form
              className="row"
              style={{ marginTop: 10, flexWrap: 'wrap' }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api('POST', `/api/v1/employees/${skillsFor}/skills`, {
                    skills: skillsInput
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  });
                  setSkillsFor('');
                }, 'Skills updated.');
              }}
            >
              <input
                className="input"
                style={{ maxWidth: 320 }}
                placeholder="Skills, comma-separated"
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
              />
              <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                Save skills
              </button>
            </form>
          ) : null}
        </div>

        {can('hcm.manage') ? (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api('POST', '/api/v1/employees', {
                  name,
                  ...(email ? { email } : {}),
                  ...(title ? { title } : {}),
                });
                setName('');
                setEmail('');
                setTitle('');
              }, 'Employee created.');
            }}
          >
            <h2>New employee</h2>
            <label className="label">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <label className="label">Email (optional)</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label className="label">Title (optional)</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button
              className="btn btn-primary"
              style={{ marginTop: 14 }}
              disabled={busy}
              type="submit"
            >
              Add employee
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}

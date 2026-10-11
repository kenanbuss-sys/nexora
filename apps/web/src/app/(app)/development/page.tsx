'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { useApp } from '../app-shell';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '../../../components/ui';
import { EmployeeDevelopment, type DevEmployee, type Pending, type UserOption } from './employee';
import { devErrorText, type DevSettings, type TemplateView } from './shared';
import { TrainingTemplates } from './templates';

/**
 * HCM-017 (Sprint 237) — employee training and development: qualification
 * levels, mentors, versioned training-plan templates, training plans with
 * item checks, and append-only training records. The mentor scope
 * (hcm.development.own = own employees only; out of scope → 404) and
 * every rule are enforced on the server — this page only renders the
 * server's answers and sends commands.
 */

interface Overview {
  employees: number;
  overdue: number;
  rechecksDue: number;
}

export default function DevelopmentPage() {
  const { can } = useApp();
  const canOwn = can('hcm.development.own');
  const canManage = can('hcm.development.manage');
  const allowed = canOwn || canManage;

  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const [notice, setNotice] = useState<string | null>(null);

  const [settings, setSettings] = useState<DevSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<DevEmployee[] | null>(null);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [templates, setTemplates] = useState<TemplateView[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserOption[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Pending idempotent submissions per employee (plan start, record):
  // the key AND the submitted content survive switching employees until
  // the server gives a clear outcome.
  const pending = useRef(new Map<string, Pending>());

  useEffect(() => {
    if (!allowed) return;
    api<DevSettings>('GET', '/api/v1/hcm/development/settings')
      .then((r) => {
        setSettings(r);
        setSettingsError(null);
      })
      .catch((e: unknown) => setSettingsError(devErrorText(e)));
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    api<{ employees: DevEmployee[] }>('GET', '/api/v1/hcm/development/employees')
      .then((r) => {
        if (cancelled) return;
        setEmployees(r.employees);
        setEmployeesError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setEmployees([]);
        setEmployeesError(devErrorText(e));
      });
    api<Overview>('GET', '/api/v1/hcm/development/overview')
      .then((r) => {
        if (!cancelled) setOverview(r);
      })
      .catch(() => {
        if (!cancelled) setOverview(null);
      });
    api<{ templates: TemplateView[] }>('GET', '/api/v1/hcm/development/templates')
      .then((r) => {
        if (cancelled) return;
        setTemplates(r.templates);
        setTemplatesError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setTemplates(null);
        setTemplatesError(devErrorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, tick]);

  useEffect(() => {
    if (!canManage) return;
    // Same user list as task assignment; it needs iam.user.manage — the
    // form falls back to a typed user ID when the list is unavailable.
    api<{ users: UserOption[] }>('GET', '/api/v1/users')
      .then((r) => {
        setUsers(r.users);
        setUsersError(null);
      })
      .catch((e: unknown) => {
        setUsers(null);
        setUsersError(devErrorText(e));
      });
  }, [canManage]);

  if (!allowed) {
    return (
      <main className="page">
        <h1>Obuka i razvoj</h1>
        <EmptyState text="Obuku i razvoj zaposlenih vide mentori s dozvolom hcm.development.own (samo vlastiti zaposleni) i HR s dozvolom hcm.development.manage (svi zaposleni) — zatražite od administratora jednu od njih." />
      </main>
    );
  }

  const levels = settings?.qualificationLevels ?? [];
  const levelLabel = (k: string | null) =>
    k ? (levels.find((l) => l.key === k)?.label ?? k) : '—';
  const mentorLabel = (id: string | null) => {
    if (!id) return null;
    return users?.find((u) => u.id === id)?.displayName ?? null;
  };
  const selected = employees?.find((e) => e.employeeId === selectedId) ?? null;

  const columns: Array<Column<DevEmployee>> = [
    {
      key: 'number',
      header: 'Broj',
      render: (e) => <span className="mono">{e.employeeNumber}</span>,
      text: (e) => e.employeeNumber,
    },
    { key: 'name', header: 'Ime', render: (e) => e.name, text: (e) => e.name },
    {
      key: 'level',
      header: 'Nivo kvalifikacije',
      render: (e) =>
        e.qualificationLevel ? levelLabel(e.qualificationLevel) : <span className="muted">—</span>,
      text: (e) => levelLabel(e.qualificationLevel),
    },
    {
      key: 'mentor',
      header: 'Mentor',
      render: (e) =>
        !e.mentorUserId ? (
          <span className="muted">—</span>
        ) : (
          (mentorLabel(e.mentorUserId) ?? <span className="badge badge-info">Dodijeljen</span>)
        ),
      text: (e) => mentorLabel(e.mentorUserId) ?? '',
    },
    {
      key: 'open',
      header: 'Otvoreni planovi',
      align: 'right',
      render: (e) => <span className="mono">{e.openPlans}</span>,
    },
    {
      key: 'overdue',
      header: 'Kasni',
      align: 'right',
      render: (e) =>
        e.overdue > 0 ? (
          <span className="badge badge-danger">{e.overdue}</span>
        ) : (
          <span className="muted">0</span>
        ),
    },
    {
      key: 'rechecks',
      header: 'Ponovne provjere',
      align: 'right',
      render: (e) =>
        e.rechecksDue > 0 ? (
          <span className="badge badge-warn">{e.rechecksDue}</span>
        ) : (
          <span className="muted">0</span>
        ),
    },
  ];

  return (
    <main className="page">
      <h1>Obuka i razvoj</h1>
      <p className="page-sub">
        Nivoi kvalifikacije, mentori, planovi obuke i evidencija obuka zaposlenih.{' '}
        {canManage
          ? 'Vidite sve zaposlene.'
          : 'Vidite samo zaposlene kojima ste dodijeljeni kao mentor.'}{' '}
        Pristup provjerava server.
      </p>
      {notice ? <div className="alert alert-ok">{notice}</div> : null}
      {settingsError ? <ErrorState text={settingsError} /> : null}

      {overview ? (
        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          <span className="badge badge-info">Zaposlenih: {overview.employees}</span>
          <span className={`badge ${overview.overdue > 0 ? 'badge-danger' : 'badge-ok'}`}>
            Planovi koji kasne: {overview.overdue}
          </span>
          <span className={`badge ${overview.rechecksDue > 0 ? 'badge-warn' : 'badge-ok'}`}>
            Dospjele ponovne provjere: {overview.rechecksDue}
          </span>
        </div>
      ) : null}

      <div className="card">
        <h2>Zaposleni</h2>
        {employeesError ? <ErrorState text={employeesError} /> : null}
        {employees === null ? (
          <LoadingState text="Učitavanje zaposlenih…" />
        ) : (
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <DataTable
              columns={columns}
              rows={employees}
              rowKey={(e) => e.employeeId}
              onRowClick={(e) => {
                setSelectedId(e.employeeId);
                setNotice(null);
              }}
              searchPlaceholder="Pretraga zaposlenih…"
              emptyText={
                canManage
                  ? 'Nema aktivnih zaposlenih.'
                  : 'Niste dodijeljeni kao mentor nijednom zaposlenom.'
              }
            />
          </div>
        )}
      </div>

      {selected && settings ? (
        <EmployeeDevelopment
          key={selected.employeeId}
          employee={selected}
          settings={settings}
          templates={templates ?? []}
          users={users}
          usersError={usersError}
          canManage={canManage}
          pending={pending.current}
          mentorLabel={mentorLabel}
          onChanged={reload}
        />
      ) : employees && employees.length > 0 ? (
        <div className="card">
          <EmptyState text="Odaberite zaposlenog iz liste za planove i evidenciju obuke." />
        </div>
      ) : null}

      {canManage ? (
        <TrainingTemplates
          templates={templates}
          levels={levels}
          error={templatesError}
          onPublished={(text) => {
            setNotice(text);
            reload();
          }}
        />
      ) : null}
    </main>
  );
}

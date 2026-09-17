'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface LeadView {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  status: 'NEW' | 'QUALIFIED' | 'DISQUALIFIED' | 'CONVERTED';
}

interface Customer360View {
  accountId: string;
  accountNumber: string;
  partyName: string;
  status: string;
  tags: string[];
  credit: {
    creditLimit: string | null;
    creditHold: boolean;
    paymentTermsDays: number | null;
    invoiced: string;
    paid: string;
    openBalance: string;
    availableCredit: string | null;
  };
  orders: {
    count: number;
    revenue: string;
    recent: Array<{ id: string; orderNumber: string; status: string; total: string }>;
  };
  quotes: { open: number };
  opportunities: { open: number; won: number };
  activities: Array<{ id: string; activityType: string; subject: string; occurredAt: string }>;
}

interface AccountView {
  id: string;
  partyName: string;
  accountNumber: string;
  status: string;
  territoryId: string | null;
}

interface TerritoryView {
  id: string;
  code: string;
  name: string;
  accountCount: number;
}

interface TeamView {
  id: string;
  code: string;
  name: string;
  territoryCount: number;
  members: Array<{ id: string; userId: string; displayName: string; email: string }>;
}

interface OpportunityView {
  id: string;
  accountId: string;
  title: string;
  stage: 'NEW' | 'QUALIFIED' | 'PROPOSAL' | 'WON' | 'LOST';
  amount: string | null;
  currency: string | null;
}

interface PartyOption {
  id: string;
  name: string;
}

const LEAD_BADGE: Record<LeadView['status'], string> = {
  NEW: 'badge-accent',
  QUALIFIED: 'badge-warn',
  CONVERTED: 'badge-ok',
  DISQUALIFIED: '',
};

const LEAD_STATUS_LABELS: Record<LeadView['status'], string> = {
  NEW: 'Novi',
  QUALIFIED: 'Kvalifikovan',
  CONVERTED: 'Konvertovan',
  DISQUALIFIED: 'Diskvalifikovan',
};

const STAGE_BADGE: Record<OpportunityView['stage'], string> = {
  NEW: 'badge-accent',
  QUALIFIED: 'badge-warn',
  PROPOSAL: 'badge-warn',
  WON: 'badge-ok',
  LOST: 'badge-danger',
};

const STAGE_LABELS: Record<OpportunityView['stage'], string> = {
  NEW: 'Nova',
  QUALIFIED: 'Kvalifikovana',
  PROPOSAL: 'Ponuda',
  WON: 'Dobijena',
  LOST: 'Izgubljena',
};

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktivan',
  INACTIVE: 'Neaktivan',
  SUSPENDED: 'Suspendovan',
  CLOSED: 'Zatvoren',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Nacrt',
  CONFIRMED: 'Potvrđena',
  ON_HOLD: 'Na čekanju',
  FULFILLED: 'Ispunjena',
  CANCELLED: 'Otkazana',
};

const NEXT_STAGES: Record<OpportunityView['stage'], OpportunityView['stage'][]> = {
  NEW: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['PROPOSAL', 'LOST'],
  PROPOSAL: ['WON', 'LOST'],
  WON: [],
  LOST: [],
};

const CASE_NEXT: Record<string, { label: string; to: string } | undefined> = {
  OPEN: { label: 'Pokreni', to: 'IN_PROGRESS' },
  IN_PROGRESS: { label: 'Riješi', to: 'RESOLVED' },
  RESOLVED: { label: 'Zatvori', to: 'CLOSED' },
};

const CASE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Otvoren',
  IN_PROGRESS: 'U toku',
  RESOLVED: 'Riješen',
  CLOSED: 'Zatvoren',
};

type ConfirmState =
  { kind: 'convert'; lead: LeadView } | { kind: 'disqualify'; lead: LeadView } | { kind: 'credit' };

export default function CrmPage() {
  const { can } = useApp();
  const [leads, setLeads] = useState<LeadView[] | null>(null);
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [territories, setTerritories] = useState<TerritoryView[]>([]);
  const [cases, setCases] = useState<
    Array<{
      id: string;
      caseNumber: string;
      subject: string;
      status: string;
      priority: string;
    }>
  >([]);
  const [caseSubject, setCaseSubject] = useState('');
  const [caseStats, setCaseStats] = useState<{
    open: number;
    inProgress: number;
    avgResolutionHours: number | null;
    overdue: Array<{ caseNumber: string; ageHours: number }>;
  } | null>(null);
  const [caseAccount, setCaseAccount] = useState('');
  const [casePriority, setCasePriority] = useState('NORMAL');
  const [onboarding, setOnboarding] = useState<
    Record<string, { started: boolean; done: number; total: number }>
  >({});
  const [loyalty, setLoyalty] = useState<
    Record<string, { points: number; transactions: Array<{ delta: number; reason: string }> }>
  >({});
  const [terrCode, setTerrCode] = useState('');
  const [terrName, setTerrName] = useState('');
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [teamCode, setTeamCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [tenantUsers, setTenantUsers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [opportunities, setOpportunities] = useState<OpportunityView[]>([]);
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const [leadName, setLeadName] = useState('');
  const [leadCompany, setLeadCompany] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [accountParty, setAccountParty] = useState('');
  const [selected360, setSelected360] = useState<string | null>(null);
  const [summary, setSummary] = useState<Customer360View | null>(null);
  const [creditLimitInput, setCreditLimitInput] = useState('');
  const [creditHoldInput, setCreditHoldInput] = useState(false);
  const [tagsInput, setTagsInput] = useState('');

  async function open360(accountId: string, forceReload = false) {
    if (selected360 === accountId && !forceReload) {
      setSelected360(null);
      setSummary(null);
      return;
    }
    try {
      const s = await api<Customer360View>('GET', `/api/v1/crm/accounts/${accountId}/summary`);
      setSelected360(accountId);
      setSummary(s);
      setCreditLimitInput(s.credit.creditLimit ?? '');
      setCreditHoldInput(s.credit.creditHold);
      setTagsInput(s.tags.join(', '));
    } catch (e: unknown) {
      setError(errorText(e));
    }
  }

  const load = useCallback(() => {
    api<{ leads: LeadView[] }>('GET', '/api/v1/crm/leads')
      .then((r) => {
        setLeads(r.leads);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    api<{ territories: TerritoryView[] }>('GET', '/api/v1/crm/territories')
      .then((r) => setTerritories(r.territories))
      .catch(() => setTerritories([]));
    api<{ teams: TeamView[] }>('GET', '/api/v1/crm/teams')
      .then((r) => setTeams(r.teams))
      .catch(() => setTeams([]));
    if (can('iam.user.manage')) {
      api<{ users: Array<{ id: string; displayName: string }> }>('GET', '/api/v1/users')
        .then((r) => setTenantUsers(r.users))
        .catch(() => setTenantUsers([]));
    }
    api<{ cases: typeof cases }>('GET', '/api/v1/support-cases')
      .then((r) => setCases(r.cases))
      .catch(() => setCases([]));
    api<NonNullable<typeof caseStats>>('GET', '/api/v1/support-cases/analytics')
      .then((r) => setCaseStats(r))
      .catch(() => setCaseStats(null));
    api<{ accounts: AccountView[] }>('GET', '/api/v1/crm/accounts')
      .then((r) => setAccounts(r.accounts))
      .catch(() => setAccounts([]));
    api<{ opportunities: OpportunityView[] }>('GET', '/api/v1/crm/opportunities')
      .then((r) => setOpportunities(r.opportunities))
      .catch(() => setOpportunities([]));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    load();
    api<{ parties: PartyOption[] }>('GET', '/api/v1/parties?q=')
      .then((r) => setParties(r.parties))
      .catch(() => undefined);
    // eslint-disable-next-line
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

  const accountName = (id: string) =>
    accounts?.find((a) => a.id === id)?.partyName ?? id.slice(0, 8);

  const leadColumns: Array<Column<LeadView>> = [
    {
      key: 'name',
      header: 'Lead',
      text: (l) => `${l.name} ${l.company ?? ''}`,
      render: (l) => (
        <>
          {l.name}
          {l.company ? (
            <div className="muted" style={{ fontSize: 12 }}>
              {l.company}
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      text: (l) => LEAD_STATUS_LABELS[l.status],
      render: (l) => (
        <span className={`badge ${LEAD_BADGE[l.status]}`}>{LEAD_STATUS_LABELS[l.status]}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (l) =>
        ['NEW', 'QUALIFIED'].includes(l.status) && can('crm.manage') ? (
          <span className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn btn-sm btn-primary"
              disabled={busy}
              onClick={() => setConfirm({ kind: 'convert', lead: l })}
              type="button"
            >
              Konvertuj
            </button>
            <button
              className="btn btn-sm"
              disabled={busy}
              onClick={() => setConfirm({ kind: 'disqualify', lead: l })}
              type="button"
            >
              Diskvalifikuj
            </button>
          </span>
        ) : null,
    },
  ];

  const accountColumns: Array<Column<AccountView>> = [
    {
      key: 'number',
      header: 'Broj konta',
      text: (a) => a.accountNumber,
      render: (a) => <span className="mono">{a.accountNumber}</span>,
    },
    {
      key: 'name',
      header: 'Kupac',
      text: (a) => a.partyName,
      render: (a) => a.partyName,
    },
    {
      key: 'status',
      header: 'Status',
      text: (a) => ACCOUNT_STATUS_LABELS[a.status] ?? a.status,
      render: (a) => (
        <span className={`badge ${a.status === 'ACTIVE' ? 'badge-ok' : 'badge-danger'}`}>
          {ACCOUNT_STATUS_LABELS[a.status] ?? a.status}
        </span>
      ),
    },
    {
      key: 'territory',
      header: 'Teritorija',
      render: (a) =>
        can('crm.manage') ? (
          <select
            className="select"
            style={{ maxWidth: 130, fontSize: 12 }}
            value={a.territoryId ?? ''}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              void run(async () => {
                await api('POST', `/api/v1/crm/accounts/${a.id}/territory`, {
                  territoryId: e.target.value || null,
                });
              }, 'Teritorija je dodijeljena.')
            }
          >
            <option value="">Bez teritorije</option>
            {territories.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code}
              </option>
            ))}
          </select>
        ) : (
          <span className="muted mono" style={{ fontSize: 12 }}>
            {territories.find((t) => t.id === a.territoryId)?.code ?? ''}
          </span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) => (
        <span onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-sm" onClick={() => void open360(a.id)} type="button">
            {selected360 === a.id ? 'Zatvori 360°' : '360°'}
          </button>{' '}
          {onboarding[a.id] ? (
            onboarding[a.id]!.started ? (
              <span className="badge" title="Napredak uvođenja">
                🚀 {onboarding[a.id]!.done}/{onboarding[a.id]!.total}
              </span>
            ) : can('crm.manage') ? (
              <button
                className="btn btn-sm"
                type="button"
                disabled={busy}
                title="Pokreni listu uvođenja kupca"
                onClick={() =>
                  run(async () => {
                    const r = await api<{ done: number; total: number }>(
                      'POST',
                      `/api/v1/crm/accounts/${a.id}/onboarding/start`,
                    );
                    setOnboarding((prev) => ({
                      ...prev,
                      [a.id]: { started: true, done: r.done, total: r.total },
                    }));
                  }, 'Uvođenje je pokrenuto — zadaci su kreirani.')
                }
              >
                🚀
              </button>
            ) : null
          ) : (
            <button
              className="btn btn-sm"
              type="button"
              title="Status uvođenja"
              onClick={() => {
                api<{ started: boolean; done: number; total: number }>(
                  'GET',
                  `/api/v1/crm/accounts/${a.id}/onboarding`,
                )
                  .then((r) =>
                    setOnboarding((prev) => ({
                      ...prev,
                      [a.id]: { started: r.started, done: r.done, total: r.total },
                    })),
                  )
                  .catch(() => undefined);
              }}
            >
              🚀?
            </button>
          )}{' '}
          {loyalty[a.id] ? (
            <span className="badge badge-ok" title="Bodovi lojalnosti">
              ★ {loyalty[a.id]!.points}
            </span>
          ) : (
            <button
              className="btn btn-sm"
              type="button"
              title="Bodovi lojalnosti"
              onClick={() => {
                api<{
                  points: number;
                  transactions: Array<{ delta: number; reason: string }>;
                }>('GET', `/api/v1/crm/accounts/${a.id}/loyalty`)
                  .then((r) =>
                    setLoyalty((prev) => ({
                      ...prev,
                      [a.id]: { points: r.points, transactions: r.transactions },
                    })),
                  )
                  .catch(() => undefined);
              }}
            >
              ★
            </button>
          )}
        </span>
      ),
    },
  ];

  const opportunityColumns: Array<Column<OpportunityView>> = [
    {
      key: 'title',
      header: 'Prilika',
      text: (o) => `${o.title} ${accountName(o.accountId)}`,
      render: (o) => (
        <>
          <strong>{o.title}</strong>
          <div className="muted" style={{ fontSize: 12 }}>
            {accountName(o.accountId)}
          </div>
        </>
      ),
    },
    {
      key: 'amount',
      header: 'Iznos',
      render: (o) => (o.amount ? `${o.amount} ${o.currency ?? ''}` : '—'),
    },
    {
      key: 'stage',
      header: 'Faza',
      text: (o) => STAGE_LABELS[o.stage],
      render: (o) => (
        <span className={`badge ${STAGE_BADGE[o.stage]}`}>{STAGE_LABELS[o.stage]}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (o) =>
        can('crm.manage') && NEXT_STAGES[o.stage].length > 0 ? (
          <span className="row" style={{ justifyContent: 'flex-end' }}>
            {NEXT_STAGES[o.stage].map((next) => (
              <button
                key={next}
                className={`btn btn-sm ${next === 'WON' ? 'btn-primary' : ''}`}
                disabled={busy}
                onClick={() =>
                  run(
                    () => api('POST', `/api/v1/crm/opportunities/${o.id}/move`, { stage: next }),
                    null,
                  )
                }
                type="button"
              >
                → {STAGE_LABELS[next]}
              </button>
            ))}
          </span>
        ) : null,
    },
  ];

  return (
    <main className="page">
      <h1>Prodaja</h1>
      <p className="page-sub">Leadovi, konta kupaca i prodajni lijevak prilika.</p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>Leadovi</h2>
            {leads === null ? <LoadingState text="Učitavanje leadova…" /> : null}
            {leads !== null ? (
              <DataTable
                columns={leadColumns}
                rows={leads}
                rowKey={(l) => l.id}
                searchPlaceholder="Pretraga leadova…"
                pageSize={10}
                emptyText="Još nema leadova."
              />
            ) : null}
          </div>

          {can('crm.manage') ? (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    api('POST', '/api/v1/crm/leads', {
                      name: leadName,
                      ...(leadCompany ? { company: leadCompany } : {}),
                      ...(leadEmail ? { email: leadEmail } : {}),
                    }),
                  'Lead je kreiran.',
                ).then(() => {
                  setLeadName('');
                  setLeadCompany('');
                  setLeadEmail('');
                });
              }}
            >
              <h2>Novi lead</h2>
              <label className="label">Ime kontakta</label>
              <input
                className="input"
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                required
              />
              <label className="label">Firma (opcionalno)</label>
              <input
                className="input"
                value={leadCompany}
                onChange={(e) => setLeadCompany(e.target.value)}
              />
              <label className="label">Email (opcionalno)</label>
              <input
                className="input"
                type="email"
                value={leadEmail}
                onChange={(e) => setLeadEmail(e.target.value)}
              />
              <button
                className="btn btn-primary"
                style={{ marginTop: 14 }}
                disabled={busy}
                type="submit"
              >
                Kreiraj lead
              </button>
            </form>
          ) : null}

          <div className="card">
            <h2>Kupci</h2>
            {accounts === null ? <LoadingState text="Učitavanje kupaca…" /> : null}
            {accounts !== null ? (
              <DataTable
                columns={accountColumns}
                rows={accounts}
                rowKey={(a) => a.id}
                onRowClick={(a) => void open360(a.id)}
                searchPlaceholder="Pretraga kupaca…"
                pageSize={10}
                emptyText="Još nema konta kupaca."
              />
            ) : null}

            {selected360 && summary ? (
              <div
                style={{
                  marginTop: 12,
                  borderTop: '1px solid var(--color-border)',
                  paddingTop: 12,
                }}
              >
                <div className="spread">
                  <strong>
                    {summary.partyName}{' '}
                    <span className="mono muted" style={{ fontSize: 12 }}>
                      {summary.accountNumber}
                    </span>
                  </strong>
                  <span className="row">
                    {summary.credit.creditHold ? (
                      <span className="badge badge-danger">KREDITNA BLOKADA</span>
                    ) : null}
                    <Link className="btn btn-sm" href="/quotes">
                      Ponude →
                    </Link>
                    <Link className="btn btn-sm" href="/orders">
                      Narudžbe →
                    </Link>
                  </span>
                </div>
                <div style={{ margin: '4px 0 8px' }}>
                  {summary.tags.map((t) => (
                    <span key={t} className="badge badge-accent" style={{ marginRight: 4 }}>
                      {t}
                    </span>
                  ))}
                </div>
                <div className="grid-4" style={{ marginBottom: 10 }}>
                  <div className="card stat">
                    <div className="stat-label">Prihod ({summary.orders.count} narudžbi)</div>
                    <div className="stat-value">{summary.orders.revenue}</div>
                  </div>
                  <div className="card stat">
                    <div className="stat-label">Otvoreni saldo</div>
                    <div className="stat-value">{summary.credit.openBalance}</div>
                  </div>
                  <div className="card stat">
                    <div className="stat-label">Kreditni limit</div>
                    <div className="stat-value">{summary.credit.creditLimit ?? '—'}</div>
                  </div>
                  <div className="card stat">
                    <div className="stat-label">Raspoloživi kredit</div>
                    <div className="stat-value">{summary.credit.availableCredit ?? '—'}</div>
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                      Nedavne narudžbe · otvorene ponude: {summary.quotes.open} · prilike:{' '}
                      {summary.opportunities.open} otvorenih / {summary.opportunities.won} dobijenih
                    </div>
                    {summary.orders.recent.length === 0 ? (
                      <EmptyState text="Još nema narudžbi." />
                    ) : (
                      summary.orders.recent.map((o) => (
                        <div key={o.id} style={{ fontSize: 13, padding: '2px 0' }}>
                          <span className="mono">{o.orderNumber}</span> — {o.total}{' '}
                          <span className="badge badge-accent">
                            {ORDER_STATUS_LABELS[o.status] ?? o.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                      Posljednje aktivnosti
                    </div>
                    {summary.activities.length === 0 ? (
                      <EmptyState text="Nema zabilježenih aktivnosti." />
                    ) : (
                      summary.activities.map((act) => (
                        <div key={act.id} className="muted" style={{ fontSize: 12 }}>
                          <span className="mono">
                            {new Date(act.occurredAt).toLocaleDateString()}
                          </span>{' '}
                          — {act.activityType}: {act.subject}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                {can('crm.manage') ? (
                  <form
                    className="row"
                    style={{ marginTop: 10 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      setConfirm({ kind: 'credit' });
                    }}
                  >
                    <input
                      className="input"
                      style={{ maxWidth: 130 }}
                      placeholder="Kreditni limit"
                      value={creditLimitInput}
                      onChange={(e) => setCreditLimitInput(e.target.value)}
                    />
                    <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={creditHoldInput}
                        onChange={(e) => setCreditHoldInput(e.target.checked)}
                      />
                      Kreditna blokada
                    </label>
                    <input
                      className="input"
                      style={{ maxWidth: 220 }}
                      placeholder="Oznake (odvojene zarezom)"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                    />
                    <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                      Sačuvaj profil
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
            {can('crm.manage') && parties.length > 0 ? (
              <form
                className="row"
                style={{ marginTop: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () => api('POST', '/api/v1/crm/accounts', { partyId: accountParty }),
                    'Konto kupca je otvoren.',
                  );
                }}
              >
                <select
                  className="select"
                  style={{ maxWidth: 260 }}
                  value={accountParty}
                  onChange={(e) => setAccountParty(e.target.value)}
                  required
                >
                  <option value="">Otvori konto za postojećeg partnera…</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button className="btn btn-sm" disabled={busy} type="submit">
                  Otvori konto kupca
                </button>
              </form>
            ) : null}
          </div>
        </div>

        <div className="card">
          <h2>Teritorije</h2>
          {territories.length === 0 ? <EmptyState text="Još nema teritorija." /> : null}
          {territories.map((t) => (
            <div key={t.id} className="row spread" style={{ marginBottom: 4 }}>
              <span>
                <span className="mono">{t.code}</span> — {t.name}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {t.accountCount} kupaca
              </span>
            </div>
          ))}
          {can('crm.manage') ? (
            <form
              className="row"
              style={{ marginTop: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api('POST', '/api/v1/crm/territories', {
                    code: terrCode,
                    name: terrName,
                  });
                  setTerrCode('');
                  setTerrName('');
                  const r = await api<{ territories: TerritoryView[] }>(
                    'GET',
                    '/api/v1/crm/territories',
                  );
                  setTerritories(r.territories);
                }, 'Teritorija je kreirana.');
              }}
            >
              <input
                className="input mono"
                style={{ maxWidth: 90 }}
                placeholder="Šifra"
                value={terrCode}
                onChange={(e) => setTerrCode(e.target.value)}
                required
              />
              <input
                className="input"
                style={{ maxWidth: 160 }}
                placeholder="Naziv"
                value={terrName}
                onChange={(e) => setTerrName(e.target.value)}
                required
              />
              <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                Dodaj
              </button>
            </form>
          ) : null}
        </div>

        <div className="card">
          <h2>Prodajni timovi</h2>
          {teams.length === 0 ? <EmptyState text="Još nema timova." /> : null}
          {teams.map((t) => (
            <div key={t.id} style={{ marginBottom: 10 }}>
              <div className="spread">
                <span>
                  <span className="mono">{t.code}</span> — {t.name}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {t.territoryCount} teritorija
                </span>
              </div>
              <div className="row" style={{ marginTop: 4, flexWrap: 'wrap', gap: 6 }}>
                {t.members.map((m) => (
                  <span key={m.id} className="badge">
                    {m.displayName}
                    {can('crm.manage') ? (
                      <button
                        className="btn btn-sm"
                        style={{ marginLeft: 4, padding: '0 6px' }}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => api('POST', `/api/v1/crm/teams/${t.id}/members/${m.id}/remove`),
                            'Član je uklonjen.',
                          )
                        }
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
                {can('crm.manage') && tenantUsers.length > 0 ? (
                  <select
                    className="select"
                    style={{ maxWidth: 150, fontSize: 12 }}
                    value=""
                    onChange={(e) => {
                      const userId = e.target.value;
                      if (!userId) return;
                      void run(
                        () => api('POST', `/api/v1/crm/teams/${t.id}/members`, { userId }),
                        'Član je dodan.',
                      );
                    }}
                  >
                    <option value="">+ član…</option>
                    {tenantUsers
                      .filter((u) => !t.members.some((m) => m.userId === u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName}
                        </option>
                      ))}
                  </select>
                ) : null}
              </div>
            </div>
          ))}
          {can('crm.manage') ? (
            <form
              className="row"
              style={{ marginTop: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api('POST', '/api/v1/crm/teams', { code: teamCode, name: teamName });
                  setTeamCode('');
                  setTeamName('');
                }, 'Tim je kreiran.');
              }}
            >
              <input
                className="input mono"
                style={{ maxWidth: 90 }}
                placeholder="Šifra"
                value={teamCode}
                onChange={(e) => setTeamCode(e.target.value)}
                required
              />
              <input
                className="input"
                style={{ maxWidth: 160 }}
                placeholder="Naziv"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                required
              />
              <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                Dodaj
              </button>
            </form>
          ) : null}
        </div>

        <div className="card">
          <h2>Prilike (pipeline)</h2>
          <DataTable
            columns={opportunityColumns}
            rows={opportunities}
            rowKey={(o) => o.id}
            searchPlaceholder="Pretraga prilika…"
            pageSize={10}
            emptyText="Nema prilika — konvertujte lead da pokrenete pipeline."
          />
        </div>
      </div>
      {can('crm.read') ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Slučajevi podrške</h2>
          {caseStats ? (
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              <span className="badge">otvoreni: {caseStats.open}</span>
              <span className="badge">u toku: {caseStats.inProgress}</span>
              {caseStats.avgResolutionHours !== null ? (
                <span className="badge badge-ok">
                  prosjek rješavanja: {caseStats.avgResolutionHours}h
                </span>
              ) : null}
              {caseStats.overdue.length > 0 ? (
                <span className="badge badge-danger">
                  SLA probijen: {caseStats.overdue.map((o) => o.caseNumber).join(', ')}
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="muted" style={{ marginTop: 0 }}>
            Prijave kupaca s jasnim životnim ciklusom — otvoren, u toku, riješen, zatvoren.
          </p>
          {cases.length === 0 ? <EmptyState text="Nema slučajeva." /> : null}
          {cases.slice(0, 10).map((c) => (
            <div key={c.id} className="row spread" style={{ marginBottom: 6 }}>
              <span>
                <strong className="mono">{c.caseNumber}</strong> {c.subject}{' '}
                <span
                  className={`badge ${
                    c.status === 'CLOSED'
                      ? ''
                      : c.status === 'RESOLVED'
                        ? 'badge-ok'
                        : c.priority === 'URGENT' || c.priority === 'HIGH'
                          ? 'badge-danger'
                          : 'badge-warn'
                  }`}
                >
                  {CASE_STATUS_LABELS[c.status] ?? c.status}
                </span>
              </span>
              {can('crm.manage') && CASE_NEXT[c.status] ? (
                <button
                  className="btn btn-sm"
                  disabled={busy}
                  type="button"
                  onClick={() =>
                    run(async () => {
                      await api('POST', `/api/v1/support-cases/${c.id}/transition`, {
                        status: CASE_NEXT[c.status]!.to,
                      });
                      const r = await api<{ cases: typeof cases }>('GET', '/api/v1/support-cases');
                      setCases(r.cases);
                    }, 'Slučaj je ažuriran.')
                  }
                >
                  {CASE_NEXT[c.status]!.label}
                </button>
              ) : null}
            </div>
          ))}
          {can('crm.manage') ? (
            <form
              className="row"
              style={{ marginTop: 10, flexWrap: 'wrap' }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api('POST', '/api/v1/support-cases', {
                    subject: caseSubject,
                    priority: casePriority,
                    ...(caseAccount ? { accountId: caseAccount } : {}),
                  });
                  setCaseSubject('');
                  const r = await api<{ cases: typeof cases }>('GET', '/api/v1/support-cases');
                  setCases(r.cases);
                }, 'Slučaj je otvoren.');
              }}
            >
              <input
                className="input"
                style={{ maxWidth: 240 }}
                placeholder="Predmet"
                value={caseSubject}
                onChange={(e) => setCaseSubject(e.target.value)}
                required
              />
              <select
                className="select"
                style={{ maxWidth: 120 }}
                value={casePriority}
                onChange={(e) => setCasePriority(e.target.value)}
              >
                <option value="LOW">Nizak</option>
                <option value="NORMAL">Normalan</option>
                <option value="HIGH">Visok</option>
                <option value="URGENT">Hitan</option>
              </select>
              <select
                className="select"
                style={{ maxWidth: 160 }}
                value={caseAccount}
                onChange={(e) => setCaseAccount(e.target.value)}
              >
                <option value="">Bez konta</option>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountNumber}
                  </option>
                ))}
              </select>
              <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                Otvori slučaj
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {confirm?.kind === 'convert' ? (
        <ConfirmDialog
          open
          title="Konverzija leada"
          consequence="Kreira kupca/priliku iz leada."
          confirmLabel="Konvertuj lead"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const lead = confirm.lead;
            void run(
              () => api('POST', `/api/v1/crm/leads/${lead.id}/convert`, {}),
              'Lead je konvertovan u kupca i priliku.',
            ).then(() => setConfirm(null));
          }}
        >
          <div className="fact">
            <span>Lead</span>
            <span>{confirm.lead.name}</span>
          </div>
          <div className="fact">
            <span>Naziv</span>
            <span>{confirm.lead.company ?? '—'}</span>
          </div>
        </ConfirmDialog>
      ) : null}

      {confirm?.kind === 'disqualify' ? (
        <ConfirmDialog
          open
          title="Diskvalifikacija leada"
          consequence="Lead se označava kao diskvalifikovan i izlazi iz dalje prodajne obrade."
          confirmLabel="Diskvalifikuj lead"
          danger
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const lead = confirm.lead;
            void run(
              () => api('POST', `/api/v1/crm/leads/${lead.id}/disqualify`),
              'Lead je diskvalifikovan.',
            ).then(() => setConfirm(null));
          }}
        >
          <div className="fact">
            <span>Lead</span>
            <span>{confirm.lead.name}</span>
          </div>
          <div className="fact">
            <span>Naziv</span>
            <span>{confirm.lead.company ?? '—'}</span>
          </div>
        </ConfirmDialog>
      ) : null}

      {confirm?.kind === 'credit' && selected360 && summary ? (
        <ConfirmDialog
          open
          title="Promjena kreditnog profila"
          consequence="Promjena kreditnog limita ili kreditne blokade direktno utiče na potvrdu i isporuku novih narudžbi ovog kupca."
          confirmLabel="Sačuvaj profil"
          danger={creditHoldInput && !summary.credit.creditHold}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const accountId = selected360;
            void run(async () => {
              await api('POST', `/api/v1/crm/accounts/${accountId}/credit`, {
                creditLimit: creditLimitInput === '' ? null : Number(creditLimitInput),
                creditHold: creditHoldInput,
              });
              await api('POST', `/api/v1/crm/accounts/${accountId}/tags`, {
                tags: tagsInput
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              });
              await open360(accountId, true);
            }, 'Kreditni profil je sačuvan.').then(() => setConfirm(null));
          }}
        >
          <div className="fact">
            <span>Kupac</span>
            <span>{summary.partyName}</span>
          </div>
          <div className="fact">
            <span>Konto</span>
            <span className="mono">{summary.accountNumber}</span>
          </div>
          <div className="fact">
            <span>Novi kreditni limit</span>
            <span>{creditLimitInput === '' ? '—' : creditLimitInput}</span>
          </div>
          <div className="fact">
            <span>Kreditna blokada</span>
            <span>{creditHoldInput ? 'Da' : 'Ne'}</span>
          </div>
        </ConfirmDialog>
      ) : null}
    </main>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface LeadView {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  status: 'NEW' | 'QUALIFIED' | 'DISQUALIFIED' | 'CONVERTED';
}

interface AccountView {
  id: string;
  partyName: string;
  accountNumber: string;
  status: string;
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

const STAGE_BADGE: Record<OpportunityView['stage'], string> = {
  NEW: 'badge-accent',
  QUALIFIED: 'badge-warn',
  PROPOSAL: 'badge-warn',
  WON: 'badge-ok',
  LOST: 'badge-danger',
};

const NEXT_STAGES: Record<OpportunityView['stage'], OpportunityView['stage'][]> = {
  NEW: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['PROPOSAL', 'LOST'],
  PROPOSAL: ['WON', 'LOST'],
  WON: [],
  LOST: [],
};

export default function CrmPage() {
  const { can } = useApp();
  const [leads, setLeads] = useState<LeadView[] | null>(null);
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityView[]>([]);
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [leadName, setLeadName] = useState('');
  const [leadCompany, setLeadCompany] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [accountParty, setAccountParty] = useState('');

  const load = useCallback(() => {
    api<{ leads: LeadView[] }>('GET', '/api/v1/crm/leads')
      .then((r) => {
        setLeads(r.leads);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
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

  return (
    <main className="page">
      <h1>Sales</h1>
      <p className="page-sub">Leads, customer accounts and the opportunity pipeline.</p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>Leads</h2>
            {leads === null ? <div className="loading">Loading leads…</div> : null}
            {leads && leads.length === 0 ? <div className="empty">No leads yet.</div> : null}
            {leads && leads.length > 0 ? (
              <table className="table">
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.name}
                        {l.company ? (
                          <div className="muted" style={{ fontSize: 12 }}>
                            {l.company}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`badge ${LEAD_BADGE[l.status]}`}>{l.status}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {['NEW', 'QUALIFIED'].includes(l.status) && can('crm.manage') ? (
                          <span className="row" style={{ justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () => api('POST', `/api/v1/crm/leads/${l.id}/convert`, {}),
                                  'Lead converted to an account + opportunity.',
                                )
                              }
                              type="button"
                            >
                              Convert
                            </button>
                            <button
                              className="btn btn-sm"
                              disabled={busy}
                              onClick={() =>
                                run(() => api('POST', `/api/v1/crm/leads/${l.id}/disqualify`), null)
                              }
                              type="button"
                            >
                              Drop
                            </button>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                  'Lead created.',
                ).then(() => {
                  setLeadName('');
                  setLeadCompany('');
                  setLeadEmail('');
                });
              }}
            >
              <h2>New lead</h2>
              <label className="label">Contact name</label>
              <input
                className="input"
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                required
              />
              <label className="label">Company (optional)</label>
              <input
                className="input"
                value={leadCompany}
                onChange={(e) => setLeadCompany(e.target.value)}
              />
              <label className="label">Email (optional)</label>
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
                Create lead
              </button>
            </form>
          ) : null}

          <div className="card">
            <h2>Accounts</h2>
            {accounts === null ? <div className="loading">Loading accounts…</div> : null}
            {accounts && accounts.length === 0 ? (
              <div className="empty">No customer accounts yet.</div>
            ) : null}
            {accounts && accounts.length > 0 ? (
              <table className="table">
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td className="mono">{a.accountNumber}</td>
                      <td>{a.partyName}</td>
                      <td>
                        <span
                          className={`badge ${a.status === 'ACTIVE' ? 'badge-ok' : 'badge-danger'}`}
                        >
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {can('crm.manage') && parties.length > 0 ? (
              <form
                className="row"
                style={{ marginTop: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () => api('POST', '/api/v1/crm/accounts', { partyId: accountParty }),
                    'Account opened.',
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
                  <option value="">Open account for existing party…</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button className="btn btn-sm" disabled={busy} type="submit">
                  Open account
                </button>
              </form>
            ) : null}
          </div>
        </div>

        <div className="card">
          <h2>Opportunity pipeline</h2>
          {opportunities.length === 0 ? (
            <div className="empty">No opportunities — convert a lead to start the pipeline.</div>
          ) : null}
          {opportunities.map((o) => (
            <div
              key={o.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <div className="spread">
                <div>
                  <strong>{o.title}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {accountName(o.accountId)}
                    {o.amount ? ` · ${o.amount} ${o.currency ?? ''}` : ''}
                  </div>
                </div>
                <span className={`badge ${STAGE_BADGE[o.stage]}`}>{o.stage}</span>
              </div>
              {can('crm.manage') && NEXT_STAGES[o.stage].length > 0 ? (
                <div className="row" style={{ marginTop: 8 }}>
                  {NEXT_STAGES[o.stage].map((next) => (
                    <button
                      key={next}
                      className={`btn btn-sm ${next === 'WON' ? 'btn-primary' : ''}`}
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api('POST', `/api/v1/crm/opportunities/${o.id}/move`, { stage: next }),
                          null,
                        )
                      }
                      type="button"
                    >
                      → {next}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

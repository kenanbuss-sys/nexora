'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

interface PartyView {
  id: string;
  partyType: string;
  name: string;
  email: string | null;
  taxId: string | null;
  status: 'ACTIVE' | 'MERGED';
  mergedIntoId: string | null;
}

interface DuplicateGroup {
  name: string;
  partyIds: string[];
}

export default function PartiesPage() {
  const { can } = useApp();
  const [query, setQuery] = useState('');
  const [parties, setParties] = useState<PartyView[] | null>(null);
  const [crList, setCrList] = useState<
    Array<{
      id: string;
      entityType: string;
      payload: Record<string, string>;
      status: string;
    }>
  >([]);
  const [crParty, setCrParty] = useState('');
  const [crName, setCrName] = useState('');
  const [crEmail, setCrEmail] = useState('');
  const [consentParty, setConsentParty] = useState<string | null>(null);
  const [consents, setConsents] = useState<Array<{
    channel: string;
    granted: boolean | null;
    recordedAt: string | null;
  }> | null>(null);

  function loadChangeRequests() {
    api<{ requests: typeof crList }>('GET', '/api/v1/mdm/change-requests')
      .then((r) => setCrList(r.requests))
      .catch(() => setCrList([]));
  }

  useEffect(() => {
    if (can('mdm.read')) loadChangeRequests();
    // eslint-disable-next-line
  }, []);

  function loadConsents(partyId: string) {
    api<{
      current: Array<{ channel: string; granted: boolean | null; recordedAt: string | null }>;
    }>('GET', `/api/v1/parties/${partyId}/consents`)
      .then((r) => setConsents(r.current))
      .catch(() => setConsents([]));
  }
  const [duplicates, setDuplicates] = useState<DuplicateGroup[] | null>(null);
  const [quality, setQuality] = useState<{
    checks: Array<{ key: string; label: string; count: number; samples: string[] }>;
    totalIssues: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [partyType, setPartyType] = useState('ORGANIZATION');
  const [email, setEmail] = useState('');
  const [taxId, setTaxId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback((q: string) => {
    api<{ parties: PartyView[] }>('GET', `/api/v1/parties?q=${encodeURIComponent(q)}`)
      .then((r) => {
        setParties(r.parties);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    load('');
  }, [load]);

  useEffect(() => {
    if (!can('mdm.steward')) return;
    api<{ duplicates: DuplicateGroup[] }>('GET', '/api/v1/parties/duplicates')
      .then((r) => setDuplicates(r.duplicates))
      .catch(() => setDuplicates([]));
    api<{
      checks: Array<{ key: string; label: string; count: number; samples: string[] }>;
      totalIssues: number;
    }>('GET', '/api/v1/parties/quality')
      .then(setQuality)
      .catch(() => setQuality(null));
  }, []);

  async function run(fn: () => Promise<unknown>, successText: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(successText);
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function createParty(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await api<PartyView>('POST', '/api/v1/parties', {
        name,
        partyType,
        ...(email ? { email } : {}),
        ...(taxId ? { taxId } : {}),
      });
      setNotice(`Party "${created.name}" created.`);
      setName('');
      setEmail('');
      setTaxId('');
      load(query);
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function merge(winnerId: string, loserId: string) {
    setError(null);
    setNotice(null);
    try {
      await api('POST', '/api/v1/parties/merge', { winnerId, loserId });
      setNotice('Parties merged.');
      load(query);
      api<{ duplicates: DuplicateGroup[] }>('GET', '/api/v1/parties/duplicates')
        .then((r) => setDuplicates(r.duplicates))
        .catch(() => undefined);
    } catch (err: unknown) {
      setError(errorText(err));
    }
  }

  return (
    <main className="page">
      <h1>Parties</h1>
      <p className="page-sub">Customers, suppliers and other business partners (master data).</p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div className="card">
          <div className="spread" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Directory</h2>
            <input
              className="input"
              style={{ maxWidth: 220 }}
              placeholder="Search by name…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                load(e.target.value);
              }}
            />
          </div>
          {parties === null ? <div className="loading">Loading parties…</div> : null}
          {parties && parties.length === 0 ? (
            <div className="empty">No parties yet. Create the first one.</div>
          ) : null}
          {parties && parties.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Email</th>
                  <th>Tax ID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      <span className="badge">{p.partyType}</span>
                    </td>
                    <td>{p.email ?? '—'}</td>
                    <td className="mono">{p.taxId ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => {
                          if (consentParty === p.id) {
                            setConsentParty(null);
                            setConsents(null);
                          } else {
                            setConsentParty(p.id);
                            setConsents(null);
                            loadConsents(p.id);
                          }
                        }}
                      >
                        Consents
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {consentParty && consents ? (
            <div
              style={{ marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}
            >
              <strong>Consents (GDPR)</strong>
              <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 10 }}>
                {consents.map((c) => (
                  <div key={c.channel} className="row" style={{ gap: 6 }}>
                    <span className="mono" style={{ fontSize: 12 }}>
                      {c.channel}
                    </span>
                    <span
                      className={`badge ${
                        c.granted === null ? '' : c.granted ? 'badge-ok' : 'badge-danger'
                      }`}
                    >
                      {c.granted === null ? 'not asked' : c.granted ? 'granted' : 'revoked'}
                    </span>
                    {can('mdm.steward') ? (
                      <>
                        <button
                          className="btn btn-sm"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await api('POST', `/api/v1/parties/${consentParty}/consents`, {
                                channel: c.channel,
                                granted: true,
                              });
                              loadConsents(consentParty);
                            }, 'Consent recorded.')
                          }
                        >
                          ✓
                        </button>
                        <button
                          className="btn btn-sm"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await api('POST', `/api/v1/parties/${consentParty}/consents`, {
                                channel: c.channel,
                                granted: false,
                              });
                              loadConsents(consentParty);
                            }, 'Revocation recorded.')
                          }
                        >
                          ×
                        </button>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div>
          {can('mdm.create') ? (
            <form className="card" onSubmit={createParty}>
              <h2>New party</h2>
              <label className="label">Name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <label className="label">Type</label>
              <select
                className="select"
                value={partyType}
                onChange={(e) => setPartyType(e.target.value)}
              >
                <option value="ORGANIZATION">Organization</option>
                <option value="PERSON">Person</option>
              </select>
              <label className="label">Email (optional)</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label className="label">Tax ID (optional)</label>
              <input className="input" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
              <button
                className="btn btn-primary"
                style={{ marginTop: 14 }}
                disabled={busy}
                type="submit"
              >
                {busy ? 'Creating…' : 'Create party'}
              </button>
            </form>
          ) : null}

          {can('mdm.steward') && quality ? (
            <div className="card">
              <h2>Data quality</h2>
              {quality.totalIssues === 0 ? (
                <div className="empty">Master data is clean — no open issues.</div>
              ) : (
                quality.checks
                  .filter((c) => c.count > 0)
                  .map((c) => (
                    <div key={c.key} className="row spread" style={{ marginBottom: 6 }}>
                      <span>
                        {c.label}
                        {c.samples.length > 0 ? (
                          <span className="muted mono" style={{ fontSize: 11, marginLeft: 6 }}>
                            {c.samples.join(', ')}
                            {c.count > c.samples.length ? '…' : ''}
                          </span>
                        ) : null}
                      </span>
                      <span className={`badge ${c.count > 0 ? 'badge-warn' : 'badge-ok'}`}>
                        {c.count}
                      </span>
                    </div>
                  ))
              )}
            </div>
          ) : null}

          {can('mdm.read') ? (
            <div className="card">
              <h2>Change requests</h2>
              <p className="muted">
                Governed master data edits — a steward other than the requester approves; only
                approval applies the change.
              </p>
              {crList.length === 0 ? <div className="empty">No change requests.</div> : null}
              {crList.slice(0, 8).map((cr) => (
                <div key={cr.id} className="row spread" style={{ marginBottom: 6 }}>
                  <span className="mono" style={{ fontSize: 12 }}>
                    {cr.entityType} · {JSON.stringify(cr.payload)} ·{' '}
                    <span className={`badge ${cr.status === 'PENDING' ? 'badge-warn' : ''}`}>
                      {cr.status}
                    </span>
                  </span>
                  {cr.status === 'PENDING' && can('mdm.steward') ? (
                    <span>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        type="button"
                        onClick={() =>
                          run(async () => {
                            await api('POST', `/api/v1/mdm/change-requests/${cr.id}/decide`, {
                              approve: true,
                            });
                            loadChangeRequests();
                          }, 'Change approved and applied.')
                        }
                      >
                        Approve
                      </button>{' '}
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        type="button"
                        onClick={() =>
                          run(async () => {
                            await api('POST', `/api/v1/mdm/change-requests/${cr.id}/decide`, {
                              approve: false,
                            });
                            loadChangeRequests();
                          }, 'Change rejected.')
                        }
                      >
                        Reject
                      </button>
                    </span>
                  ) : null}
                </div>
              ))}
              {can('mdm.create') ? (
                <form
                  className="row"
                  style={{ marginTop: 10, flexWrap: 'wrap' }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const payload: Record<string, string> = {};
                    if (crName.trim()) payload.name = crName.trim();
                    if (crEmail.trim()) payload.email = crEmail.trim();
                    void run(async () => {
                      await api('POST', '/api/v1/mdm/change-requests', {
                        entityType: 'party',
                        entityId: crParty,
                        payload,
                      });
                      setCrName('');
                      setCrEmail('');
                      loadChangeRequests();
                    }, 'Change request submitted.');
                  }}
                >
                  <select
                    className="select"
                    style={{ maxWidth: 160 }}
                    value={crParty}
                    onChange={(e) => setCrParty(e.target.value)}
                    required
                  >
                    <option value="">Party…</option>
                    {(parties ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    style={{ maxWidth: 150 }}
                    placeholder="New name"
                    value={crName}
                    onChange={(e) => setCrName(e.target.value)}
                  />
                  <input
                    className="input"
                    style={{ maxWidth: 170 }}
                    placeholder="New e-mail"
                    value={crEmail}
                    onChange={(e) => setCrEmail(e.target.value)}
                  />
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy || !crParty || (!crName.trim() && !crEmail.trim())}
                    type="submit"
                  >
                    Request change
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
          {can('mdm.steward') && duplicates && duplicates.length > 0 ? (
            <div className="card">
              <h2>Possible duplicates</h2>
              {duplicates.map((group) => (
                <div key={group.name} style={{ marginBottom: 10 }}>
                  <strong>{group.name}</strong>
                  <div className="muted mono" style={{ fontSize: 12 }}>
                    {group.partyIds.length} records
                  </div>
                  {can('mdm.merge') && group.partyIds.length >= 2 ? (
                    <button
                      className="btn btn-sm"
                      style={{ marginTop: 4 }}
                      onClick={() => {
                        const [winner, loser] = group.partyIds as [string, string];
                        void merge(winner, loser);
                      }}
                      type="button"
                    >
                      Merge first two (keep oldest)
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

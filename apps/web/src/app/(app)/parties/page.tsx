'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '../../../components/ui';

const PARTY_TYPE_LABELS: Record<string, string> = {
  ORGANIZATION: 'Organizacija',
  PERSON: 'Fizičko lice',
};

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Nacrt',
  ACTIVE: 'Aktivan',
  EXPIRED: 'Istekao',
  TERMINATED: 'Raskinut',
};

const CR_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Na čekanju',
  APPROVED: 'Odobren',
  REJECTED: 'Odbijen',
};

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
  const [contracts, setContracts] = useState<
    Array<{
      id: string;
      contractNumber: string;
      title: string;
      partyName: string;
      status: string;
      endsAt: string | null;
    }>
  >([]);
  const [renewals, setRenewals] = useState<Array<{ id: string; contractNumber: string }>>([]);
  const [ctTitle, setCtTitle] = useState('');
  const [ctParty, setCtParty] = useState('');
  const [ctEnds, setCtEnds] = useState('');
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

  function loadContracts() {
    api<{ contracts: typeof contracts }>('GET', '/api/v1/contracts')
      .then((r) => setContracts(r.contracts))
      .catch(() => setContracts([]));
    api<{ renewals: typeof renewals }>('GET', '/api/v1/contracts/renewals')
      .then((r) => setRenewals(r.renewals))
      .catch(() => setRenewals([]));
  }

  useEffect(() => {
    loadContracts();
    // eslint-disable-next-line
  }, []);

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
      setNotice(`Partner "${created.name}" je kreiran.`);
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
      setNotice('Partneri su spojeni.');
      load(query);
      api<{ duplicates: DuplicateGroup[] }>('GET', '/api/v1/parties/duplicates')
        .then((r) => setDuplicates(r.duplicates))
        .catch(() => undefined);
    } catch (err: unknown) {
      setError(errorText(err));
    }
  }

  const partyColumns: Array<Column<PartyView>> = [
    {
      key: 'name',
      header: 'Naziv',
      render: (p) => p.name,
      text: (p) => p.name,
    },
    {
      key: 'type',
      header: 'Tip',
      render: (p) => <span className="badge">{PARTY_TYPE_LABELS[p.partyType] ?? p.partyType}</span>,
      text: (p) => PARTY_TYPE_LABELS[p.partyType] ?? p.partyType,
    },
    {
      key: 'email',
      header: 'E-mail',
      render: (p) => p.email ?? '—',
      text: (p) => p.email ?? '',
    },
    {
      key: 'taxId',
      header: 'Porezni broj',
      render: (p) => <span className="mono">{p.taxId ?? '—'}</span>,
      text: (p) => p.taxId ?? '',
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <>
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
            Saglasnosti
          </button>{' '}
          {can('mdm.steward') && p.partyType === 'PERSON' ? (
            <button
              className="btn btn-sm"
              type="button"
              disabled={busy}
              title="GDPR brisanje — nepovratna anonimizacija"
              onClick={() => {
                if (window.confirm(`GDPR brisanje za ${p.name}? Ova radnja je nepovratna.`)) {
                  void run(
                    () => api('POST', `/api/v1/parties/${p.id}/anonymize`),
                    'Partner je anonimiziran (GDPR brisanje).',
                  );
                }
              }}
            >
              GDPR
            </button>
          ) : null}
        </>
      ),
    },
  ];

  return (
    <main className="page">
      <h1>Partneri</h1>
      <p className="page-sub">Kupci, dobavljači i drugi poslovni partneri (matični podaci).</p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div className="card">
          <div className="spread" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Imenik</h2>
            <input
              className="input"
              style={{ maxWidth: 220 }}
              placeholder="Pretraga po nazivu…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                load(e.target.value);
              }}
            />
          </div>
          {parties === null ? <LoadingState text="Učitavanje partnera…" /> : null}
          {parties ? (
            <DataTable
              columns={partyColumns}
              rows={parties}
              rowKey={(p) => p.id}
              searchPlaceholder="Filtriraj po nazivu, tipu, broju…"
              pageSize={10}
              emptyText="Još nema partnera. Kreirajte prvog."
            />
          ) : null}

          {consentParty && consents ? (
            <div
              style={{ marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}
            >
              <strong>Saglasnosti (GDPR)</strong>
              {consents.length === 0 ? <EmptyState text="Nema evidentiranih saglasnosti." /> : null}
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
                      {c.granted === null ? 'nije upitano' : c.granted ? 'data' : 'povučena'}
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
                            }, 'Saglasnost je evidentirana.')
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
                            }, 'Povlačenje je evidentirano.')
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
              <h2>Novi partner</h2>
              <label className="label">Naziv</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <label className="label">Tip</label>
              <select
                className="select"
                value={partyType}
                onChange={(e) => setPartyType(e.target.value)}
              >
                <option value="ORGANIZATION">Organizacija</option>
                <option value="PERSON">Fizičko lice</option>
              </select>
              <label className="label">E-mail (opciono)</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label className="label">Porezni broj (opciono)</label>
              <input className="input" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
              <button
                className="btn btn-primary"
                style={{ marginTop: 14 }}
                disabled={busy}
                type="submit"
              >
                {busy ? 'Kreiranje…' : 'Kreiraj partnera'}
              </button>
            </form>
          ) : null}

          {can('mdm.steward') && quality ? (
            <div className="card">
              <h2>Kvalitet podataka</h2>
              {quality.totalIssues === 0 ? (
                <EmptyState text="Matični podaci su uredni — nema otvorenih problema." />
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

          <div className="card">
            <h2>Ugovori</h2>
            <p className="muted">
              Registar ugovora sa životnim ciklusom i podsjetnicima za obnovu na osnovu datuma
              isteka.
            </p>
            {renewals.length > 0 ? (
              <div className="alert alert-warn" style={{ marginBottom: 8 }}>
                Obnova dospijeva: {renewals.map((r) => r.contractNumber).join(', ')}
              </div>
            ) : null}
            {contracts.length === 0 ? <EmptyState text="Nema ugovora." /> : null}
            {contracts.slice(0, 8).map((c) => (
              <div key={c.id} className="row spread" style={{ marginBottom: 6 }}>
                <span>
                  <strong className="mono">{c.contractNumber}</strong> {c.title}{' '}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {c.partyName}
                    {c.endsAt ? ` · do ${new Date(c.endsAt).toLocaleDateString()}` : ''}
                  </span>
                </span>
                <span>
                  <span
                    className={`badge ${
                      c.status === 'ACTIVE' ? 'badge-ok' : c.status === 'DRAFT' ? 'badge-warn' : ''
                    }`}
                  >
                    {CONTRACT_STATUS_LABELS[c.status] ?? c.status}
                  </span>{' '}
                  {c.status === 'DRAFT' ? (
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        run(async () => {
                          await api('POST', `/api/v1/contracts/${c.id}/transition`, {
                            status: 'ACTIVE',
                          });
                          loadContracts();
                        }, 'Ugovor je aktiviran.')
                      }
                    >
                      Aktiviraj
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
            <form
              className="row"
              style={{ marginTop: 10, flexWrap: 'wrap' }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api('POST', '/api/v1/contracts', {
                    title: ctTitle,
                    partyId: ctParty,
                    startsAt: new Date().toISOString(),
                    ...(ctEnds ? { endsAt: new Date(ctEnds).toISOString() } : {}),
                  });
                  setCtTitle('');
                  loadContracts();
                }, 'Ugovor je kreiran (nacrt).');
              }}
            >
              <input
                className="input"
                style={{ maxWidth: 180 }}
                placeholder="Naslov"
                value={ctTitle}
                onChange={(e) => setCtTitle(e.target.value)}
                required
              />
              <select
                className="select"
                style={{ maxWidth: 160 }}
                value={ctParty}
                onChange={(e) => setCtParty(e.target.value)}
                required
              >
                <option value="">Partner…</option>
                {(parties ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                style={{ maxWidth: 150 }}
                type="date"
                title="Datum isteka (opciono)"
                value={ctEnds}
                onChange={(e) => setCtEnds(e.target.value)}
              />
              <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
                Dodaj ugovor
              </button>
            </form>
          </div>

          {can('mdm.read') ? (
            <div className="card">
              <h2>Zahtjevi za izmjenu</h2>
              <p className="muted">
                Kontrolisane izmjene matičnih podataka — odobrava steward koji nije podnosilac;
                izmjena se primjenjuje tek nakon odobrenja.
              </p>
              {crList.length === 0 ? <EmptyState text="Nema zahtjeva za izmjenu." /> : null}
              {crList.slice(0, 8).map((cr) => (
                <div key={cr.id} className="row spread" style={{ marginBottom: 6 }}>
                  <span className="mono" style={{ fontSize: 12 }}>
                    {cr.entityType} · {JSON.stringify(cr.payload)} ·{' '}
                    <span className={`badge ${cr.status === 'PENDING' ? 'badge-warn' : ''}`}>
                      {CR_STATUS_LABELS[cr.status] ?? cr.status}
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
                          }, 'Izmjena je odobrena i primijenjena.')
                        }
                      >
                        Odobri
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
                          }, 'Izmjena je odbijena.')
                        }
                      >
                        Odbij
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
                    }, 'Zahtjev za izmjenu je podnesen.');
                  }}
                >
                  <select
                    className="select"
                    style={{ maxWidth: 160 }}
                    value={crParty}
                    onChange={(e) => setCrParty(e.target.value)}
                    required
                  >
                    <option value="">Partner…</option>
                    {(parties ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    style={{ maxWidth: 150 }}
                    placeholder="Novi naziv"
                    value={crName}
                    onChange={(e) => setCrName(e.target.value)}
                  />
                  <input
                    className="input"
                    style={{ maxWidth: 170 }}
                    placeholder="Novi e-mail"
                    value={crEmail}
                    onChange={(e) => setCrEmail(e.target.value)}
                  />
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy || !crParty || (!crName.trim() && !crEmail.trim())}
                    type="submit"
                  >
                    Zatraži izmjenu
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
          {can('mdm.steward') && duplicates && duplicates.length > 0 ? (
            <div className="card">
              <h2>Mogući duplikati</h2>
              {duplicates.map((group) => (
                <div key={group.name} style={{ marginBottom: 10 }}>
                  <strong>{group.name}</strong>
                  <div className="muted mono" style={{ fontSize: 12 }}>
                    {group.partyIds.length} zapisa
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
                      Spoji prva dva (zadrži najstariji)
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

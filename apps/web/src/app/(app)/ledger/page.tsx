'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { useApp } from '../app-shell';

/**
 * FIN-023..026 (Sprint 211) — general ledger: chart of accounts and
 * journal entries (draft → review balance → post; storno for posted).
 */

interface LegalEntity {
  id: string;
  name: string;
}

interface AccountView {
  id: string;
  code: string;
  name: string;
  class: string;
  active: boolean;
}

interface EntryLine {
  seq: number;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

interface EntryView {
  id: string;
  entryNo: number | null;
  entryType: string;
  status: string;
  bookingDate: string;
  description: string;
  stornoedById: string | null;
  totalDebit: string;
  totalCredit: string;
  lines: EntryLine[];
}

interface DraftLine {
  accountId: string;
  debit: string;
  credit: string;
}

const ENTRY_TYPES = ['MANUAL', 'OPENING_BALANCE', 'KUF', 'KIF', 'BANK_STATEMENT', 'COMPENSATION'];

export default function LedgerPage() {
  const { can } = useApp();
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [entityId, setEntityId] = useState('');
  const [tab, setTab] = useState<'entries' | 'accounts'>('entries');
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [entries, setEntries] = useState<EntryView[]>([]);
  const [open, setOpen] = useState<EntryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New account form.
  const [accCode, setAccCode] = useState('');
  const [accName, setAccName] = useState('');

  // Draft entry form.
  const [entryType, setEntryType] = useState('MANUAL');
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { accountId: '', debit: '', credit: '' },
    { accountId: '', debit: '', credit: '' },
  ]);
  const [stornoReason, setStornoReason] = useState('');

  useEffect(() => {
    api<{ legalEntities: LegalEntity[] }>('GET', '/api/v1/organization/tree')
      .then((r) => {
        setEntities(r.legalEntities);
        if (r.legalEntities[0]) setEntityId((prev) => prev || r.legalEntities[0]!.id);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  const load = useCallback(() => {
    if (!entityId) return;
    api<{ accounts: AccountView[] }>('GET', `/api/v1/ledger/accounts?legalEntityId=${entityId}`)
      .then((r) => {
        setAccounts(r.accounts);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
    api<{ entries: EntryView[] }>('GET', `/api/v1/ledger/entries?legalEntityId=${entityId}`)
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
  }, [entityId]);

  useEffect(load, [load]);

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

  const totalDebit = draftLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = draftLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

  function setLine(i: number, patch: Partial<DraftLine>) {
    setDraftLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function createDraft(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api('POST', '/api/v1/ledger/entries', {
        legalEntityId: entityId,
        entryType,
        bookingDate,
        description,
        lines: draftLines
          .filter((l) => l.accountId)
          .map((l) => ({
            accountId: l.accountId,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
          })),
      });
      setDescription('');
      setDraftLines([
        { accountId: '', debit: '', credit: '' },
        { accountId: '', debit: '', credit: '' },
      ]);
    }, 'Draft naloga je kreiran.');
  }

  if (!can('finance.ledger.read')) {
    return (
      <main className="page">
        <h1>Ledger</h1>
        <div className="alert alert-error">
          Pristup glavnoj knjizi zahtijeva finansijsku permisiju (finance.ledger.read).
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Glavna knjiga</h1>
      <p className="page-sub">
        Dvojno knjigovodstvo po pravnom licu — nalozi (draft → proknjiženo) i kontni plan.
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <label className="label">Pravno lice</label>
          <select
            className="input"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            style={{ maxWidth: 320 }}
          >
            {entities.map((le) => (
              <option key={le.id} value={le.id}>
                {le.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <button
            className={`btn btn-sm ${tab === 'entries' ? 'btn-primary' : ''}`}
            onClick={() => setTab('entries')}
          >
            Nalozi
          </button>{' '}
          <button
            className={`btn btn-sm ${tab === 'accounts' ? 'btn-primary' : ''}`}
            onClick={() => setTab('accounts')}
          >
            Kontni plan
          </button>
        </div>
      </div>

      {entities.length === 0 ? (
        <div className="empty">
          Nema pravnih lica. Kreirajte pravno lice u organizaciji prije rada s knjigom.
        </div>
      ) : null}

      {tab === 'accounts' && entityId ? (
        <div className="grid-2">
          <div className="card">
            <h2>Kontni plan</h2>
            {accounts.length === 0 ? <div className="empty">Nema konta.</div> : null}
            {accounts.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Konto</th>
                    <th>Naziv</th>
                    <th>Klasa</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td className="mono">{a.code}</td>
                      <td>{a.name}</td>
                      <td>{a.class}</td>
                      <td>
                        <span className={`badge ${a.active ? 'badge-ok' : ''}`}>
                          {a.active ? 'aktivno' : 'neaktivno'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
          {can('finance.ledger.manage') ? (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api('POST', '/api/v1/ledger/accounts', {
                    legalEntityId: entityId,
                    code: accCode,
                    name: accName,
                  });
                  setAccCode('');
                  setAccName('');
                }, 'Konto je dodano.');
              }}
            >
              <h2>Novo konto</h2>
              <label className="label">Šifra (8 cifara)</label>
              <input
                className="input mono"
                value={accCode}
                onChange={(e) => setAccCode(e.target.value)}
                placeholder="npr. 43200001"
                required
              />
              <label className="label">Naziv</label>
              <input
                className="input"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                required
              />
              <button className="btn btn-primary" disabled={busy} style={{ marginTop: 10 }}>
                Dodaj konto
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {tab === 'entries' && entityId ? (
        <div className="grid-2">
          <div className="card">
            <h2>Nalozi</h2>
            {entries.length === 0 ? <div className="empty">Nema naloga.</div> : null}
            {entries.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Br.</th>
                    <th>Datum</th>
                    <th>Vrsta</th>
                    <th>Opis</th>
                    <th>Iznos</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((en) => (
                    <tr key={en.id} onClick={() => setOpen(en)} style={{ cursor: 'pointer' }}>
                      <td className="mono">{en.entryNo ?? '—'}</td>
                      <td className="mono">{en.bookingDate}</td>
                      <td>{en.entryType}</td>
                      <td>{en.description}</td>
                      <td className="mono">{en.totalDebit}</td>
                      <td>
                        <span
                          className={`badge ${
                            en.status === 'POSTED'
                              ? en.stornoedById
                                ? 'badge-warn'
                                : 'badge-ok'
                              : 'badge-accent'
                          }`}
                        >
                          {en.status === 'POSTED' && en.stornoedById ? 'STORNIRAN' : en.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {open ? (
              <div className="card" style={{ marginTop: 12 }}>
                <div className="spread">
                  <h2 style={{ margin: 0 }}>
                    Nalog {open.entryNo ?? '(draft)'} — {open.entryType}
                  </h2>
                  <button className="btn btn-sm" onClick={() => setOpen(null)}>
                    Zatvori
                  </button>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Konto</th>
                      <th>Naziv</th>
                      <th>Duguje</th>
                      <th>Potražuje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.lines.map((l) => (
                      <tr key={l.seq}>
                        <td>{l.seq}</td>
                        <td className="mono">{l.accountCode}</td>
                        <td>{l.accountName}</td>
                        <td className="mono">{l.debit}</td>
                        <td className="mono">{l.credit}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3}>
                        <strong>Ukupno</strong>
                      </td>
                      <td className="mono">
                        <strong>{open.totalDebit}</strong>
                      </td>
                      <td className="mono">
                        <strong>{open.totalCredit}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
                {can('finance.ledger.post') && open.status === 'DRAFT' ? (
                  <div className="spread" style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-primary"
                      disabled={busy || open.totalDebit !== open.totalCredit}
                      onClick={() =>
                        void run(async () => {
                          await api('POST', `/api/v1/ledger/entries/${open.id}/post`);
                          setOpen(null);
                        }, 'Nalog je proknjižen.')
                      }
                    >
                      Proknjiži
                    </button>
                    {open.totalDebit !== open.totalCredit ? (
                      <span className="badge badge-warn">
                        D≠P — nalog nije u ravnoteži i ne može se proknjižiti
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {can('finance.ledger.post') &&
                open.status === 'POSTED' &&
                !open.stornoedById &&
                open.entryType !== 'STORNO' ? (
                  <div style={{ marginTop: 10 }}>
                    <label className="label">Razlog storna</label>
                    <input
                      className="input"
                      value={stornoReason}
                      onChange={(e) => setStornoReason(e.target.value)}
                      placeholder="min. 5 znakova"
                    />
                    <button
                      className="btn btn-danger"
                      disabled={busy || stornoReason.trim().length < 5}
                      style={{ marginTop: 8 }}
                      onClick={() =>
                        void run(async () => {
                          await api('POST', `/api/v1/ledger/entries/${open.id}/storno`, {
                            reason: stornoReason,
                          });
                          setStornoReason('');
                          setOpen(null);
                        }, 'Storno nalog je kreiran i proknjižen.')
                      }
                    >
                      Storniraj
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {can('finance.ledger.post') ? (
            <form className="card" onSubmit={(e) => void createDraft(e)}>
              <h2>Novi nalog (draft)</h2>
              <label className="label">Vrsta</label>
              <select
                className="input"
                value={entryType}
                onChange={(e) => setEntryType(e.target.value)}
              >
                {ENTRY_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <label className="label">Datum knjiženja</label>
              <input
                className="input"
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                required
              />
              <label className="label">Opis</label>
              <input
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
              <label className="label">Stavke</label>
              {draftLines.map((l, i) => (
                <div key={i} className="spread" style={{ gap: 6, marginBottom: 6 }}>
                  <select
                    className="input"
                    value={l.accountId}
                    onChange={(e) => setLine(i, { accountId: e.target.value })}
                  >
                    <option value="">— konto —</option>
                    {accounts
                      .filter((a) => a.active)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} {a.name}
                        </option>
                      ))}
                  </select>
                  <input
                    className="input mono"
                    style={{ maxWidth: 110 }}
                    placeholder="Duguje"
                    value={l.debit}
                    onChange={(e) => setLine(i, { debit: e.target.value, credit: '' })}
                  />
                  <input
                    className="input mono"
                    style={{ maxWidth: 110 }}
                    placeholder="Potražuje"
                    value={l.credit}
                    onChange={(e) => setLine(i, { credit: e.target.value, debit: '' })}
                  />
                </div>
              ))}
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  setDraftLines((p) => [...p, { accountId: '', debit: '', credit: '' }])
                }
              >
                + stavka
              </button>
              <div style={{ marginTop: 10 }}>
                <span className={`badge ${balanced ? 'badge-ok' : 'badge-warn'}`}>
                  Duguje {totalDebit.toFixed(2)} · Potražuje {totalCredit.toFixed(2)} ·{' '}
                  {balanced ? 'u ravnoteži' : 'NIJE u ravnoteži'}
                </span>
              </div>
              <button
                className="btn btn-primary"
                disabled={busy || !balanced}
                style={{ marginTop: 10 }}
              >
                Sačuvaj draft
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

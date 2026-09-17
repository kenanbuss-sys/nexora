'use client';

import { useCallback, useEffect, useState } from 'react';
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
 * FIN-023..026 (Sprint 211) — general ledger: chart of accounts and
 * journal entries (draft → review balance → post; storno for posted).
 * Sprint 217 — UI aligned with the shared standard (DataTable,
 * ConfirmDialog, Bosnian labels, loading/empty/error states).
 */

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

interface CardRowView {
  entryId: string;
  entryNo: number | null;
  bookingDate: string;
  entryType: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
}

interface CardView {
  accountCode: string;
  accountName: string;
  openingBalance: string;
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
  rows: CardRowView[];
}

interface TrialRowView {
  accountId: string;
  code: string;
  name: string;
  opening: string;
  debit: string;
  credit: string;
  closing: string;
}

interface TrialView {
  rows: TrialRowView[];
  totals: { opening: string; debit: string; credit: string; closing: string };
}

interface DraftLine {
  accountId: string;
  debit: string;
  credit: string;
}

const ENTRY_TYPES = ['MANUAL', 'OPENING_BALANCE', 'KUF', 'KIF', 'BANK_STATEMENT', 'COMPENSATION'];

/** Display labels for API entry types (API values stay untouched). */
const ENTRY_TYPE_LABELS: Record<string, string> = {
  MANUAL: 'Ručni nalog',
  OPENING_BALANCE: 'Početno stanje',
  KUF: 'KUF',
  KIF: 'KIF',
  BANK_STATEMENT: 'Izvod banke',
  COMPENSATION: 'Kompenzacija',
  STORNO: 'Storno',
};

/** Display labels for API entry statuses (API values stay untouched). */
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Nacrt',
  POSTED: 'Proknjižen',
};

function entryTypeLabel(t: string) {
  return ENTRY_TYPE_LABELS[t] ?? t;
}

function statusBadge(en: EntryView) {
  const stornoed = en.status === 'POSTED' && en.stornoedById;
  return (
    <span
      className={`badge ${en.status === 'POSTED' ? (stornoed ? 'badge-warn' : 'badge-ok') : 'badge-accent'}`}
    >
      {stornoed ? 'Storniran' : (STATUS_LABELS[en.status] ?? en.status)}
    </span>
  );
}

export default function LedgerPage() {
  const { can, entities, legalEntityId: entityId } = useApp();
  const [tab, setTab] = useState<'entries' | 'accounts' | 'card' | 'trial'>('entries');
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [entries, setEntries] = useState<EntryView[] | null>(null);
  const [open, setOpen] = useState<EntryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Confirmation dialogs for critical actions (Sprint 217).
  const [confirmPost, setConfirmPost] = useState(false);
  const [confirmStorno, setConfirmStorno] = useState(false);

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

  // Reports (Sprint 212): account card + trial balance (read-only).
  const [cardAccountId, setCardAccountId] = useState('');
  const [cardFrom, setCardFrom] = useState(() => new Date().getFullYear() + '-01-01');
  const [cardTo, setCardTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [cardShowStorno, setCardShowStorno] = useState(false);
  const [card, setCard] = useState<CardView | null>(null);
  const [trial, setTrial] = useState<TrialView | null>(null);

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
    }, 'Nacrt naloga je kreiran.');
  }

  /** Opens an entry (from the card report) in the "Nalozi" tab. */
  function openEntryById(entryId: string) {
    const en = (entries ?? []).find((e) => e.id === entryId);
    if (!en) return;
    setOpen(en);
    setTab('entries');
  }

  if (!can('finance.ledger.read')) {
    return (
      <main className="page">
        <h1>Glavna knjiga</h1>
        <ErrorState text="Pristup glavnoj knjizi zahtijeva finansijsku permisiju (finance.ledger.read)." />
      </main>
    );
  }

  const entityName = entities.find((le) => le.id === entityId)?.name ?? '—';

  const accountColumns: Array<Column<AccountView>> = [
    {
      key: 'code',
      header: 'Konto',
      render: (a) => <span className="mono">{a.code}</span>,
      text: (a) => a.code,
    },
    { key: 'name', header: 'Naziv', render: (a) => a.name, text: (a) => a.name },
    { key: 'class', header: 'Klasa', render: (a) => a.class, text: (a) => a.class },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (
        <span className={`badge ${a.active ? 'badge-ok' : ''}`}>
          {a.active ? 'aktivno' : 'neaktivno'}
        </span>
      ),
    },
  ];

  const entryColumns: Array<Column<EntryView>> = [
    {
      key: 'no',
      header: 'Br.',
      render: (en) => <span className="mono">{en.entryNo ?? '—'}</span>,
      text: (en) => String(en.entryNo ?? ''),
    },
    {
      key: 'date',
      header: 'Datum',
      render: (en) => <span className="mono">{en.bookingDate}</span>,
      text: (en) => en.bookingDate,
    },
    {
      key: 'type',
      header: 'Vrsta',
      render: (en) => entryTypeLabel(en.entryType),
      text: (en) => entryTypeLabel(en.entryType),
    },
    {
      key: 'description',
      header: 'Opis',
      render: (en) => en.description,
      text: (en) => en.description,
    },
    {
      key: 'amount',
      header: 'Iznos',
      align: 'right',
      render: (en) => <span className="mono">{en.totalDebit}</span>,
    },
    { key: 'status', header: 'Status', render: (en) => statusBadge(en) },
  ];

  return (
    <main className="page">
      <h1>Glavna knjiga</h1>
      <p className="page-sub">
        Dvojno knjigovodstvo po pravnom licu — nalozi (nacrt → proknjiženo) i kontni plan.
      </p>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            Aktivno pravno lice: <strong>{entityName}</strong> (mijenja se u traci iznad)
          </p>
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
          </button>{' '}
          <button
            className={`btn btn-sm ${tab === 'card' ? 'btn-primary' : ''}`}
            onClick={() => setTab('card')}
          >
            Kartica
          </button>{' '}
          <button
            className={`btn btn-sm ${tab === 'trial' ? 'btn-primary' : ''}`}
            onClick={() => setTab('trial')}
          >
            Bruto bilans
          </button>
        </div>
      </div>

      {entities.length === 0 ? (
        <EmptyState text="Nema pravnih lica. Kreirajte pravno lice u organizaciji prije rada s knjigom." />
      ) : null}

      {tab === 'accounts' && entityId ? (
        <div className="grid-2">
          <div className="card">
            <h2>Kontni plan</h2>
            {accounts === null ? (
              <LoadingState text="Učitavanje kontnog plana…" />
            ) : (
              <DataTable
                columns={accountColumns}
                rows={accounts}
                rowKey={(a) => a.id}
                searchPlaceholder="Pretraga konta…"
                pageSize={15}
                emptyText="Nema konta. Dodajte prvo konto putem forme."
              />
            )}
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
            {entries === null ? (
              <LoadingState text="Učitavanje naloga…" />
            ) : (
              <DataTable
                columns={entryColumns}
                rows={entries}
                rowKey={(en) => en.id}
                onRowClick={(en) => setOpen(en)}
                searchPlaceholder="Pretraga naloga…"
                pageSize={10}
                emptyText="Nema naloga. Kreirajte prvi nalog putem forme."
              />
            )}

            {open ? (
              <div className="card" style={{ marginTop: 12 }}>
                <div className="spread">
                  <h2 style={{ margin: 0 }}>
                    Nalog {open.entryNo ?? '(nacrt)'} — {entryTypeLabel(open.entryType)}
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
                      onClick={() => setConfirmPost(true)}
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
                    <button className="btn btn-danger" onClick={() => setConfirmStorno(true)}>
                      Storniraj
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {can('finance.ledger.post') ? (
            <form className="card" onSubmit={(e) => void createDraft(e)}>
              <h2>Novi nalog (nacrt)</h2>
              <label className="label">Vrsta</label>
              <select
                className="input"
                value={entryType}
                onChange={(e) => setEntryType(e.target.value)}
              >
                {ENTRY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {entryTypeLabel(t)}
                  </option>
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
                    {(accounts ?? [])
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
                Sačuvaj nacrt
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {tab === 'card' && entityId ? (
        <div className="card">
          <h2>Kartica konta</h2>
          <p className="page-sub" style={{ marginTop: 0 }}>
            Izvještaj — ne mijenja knjigu.
          </p>
          <div className="spread" style={{ gap: 8, flexWrap: 'wrap' }}>
            <select
              className="input"
              style={{ maxWidth: 280 }}
              value={cardAccountId}
              onChange={(e) => setCardAccountId(e.target.value)}
            >
              <option value="">— konto —</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              type="date"
              style={{ maxWidth: 160 }}
              value={cardFrom}
              onChange={(e) => setCardFrom(e.target.value)}
            />
            <input
              className="input"
              type="date"
              style={{ maxWidth: 160 }}
              value={cardTo}
              onChange={(e) => setCardTo(e.target.value)}
            />
            <label className="label" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={cardShowStorno}
                onChange={(e) => setCardShowStorno(e.target.checked)}
              />{' '}
              prikaži storno parove
            </label>
            <button
              className="btn btn-primary btn-sm"
              disabled={busy || !cardAccountId}
              onClick={() =>
                void run(async () => {
                  const r = await api<CardView>(
                    'GET',
                    `/api/v1/ledger/reports/account-card?legalEntityId=${entityId}&accountId=${cardAccountId}&from=${cardFrom}&to=${cardTo}&includeStorno=${cardShowStorno}`,
                  );
                  setCard(r);
                }, null)
              }
            >
              Prikaži
            </button>
          </div>
          {busy && !card ? <LoadingState text="Učitavanje kartice…" /> : null}
          {!card && !busy ? (
            <EmptyState text="Odaberite konto i period pa kliknite „Prikaži“." />
          ) : null}
          {card ? (
            <>
              <p className="page-sub" style={{ marginTop: 10 }}>
                {card.accountCode} {card.accountName} · PS {card.openingBalance} · promet D{' '}
                {card.totalDebit} / P {card.totalCredit} · saldo {card.closingBalance}
              </p>
              {card.rows.length === 0 ? <EmptyState text="Nema prometa u periodu." /> : null}
              {card.rows.length > 0 ? (
                <>
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    Klik na red otvara nalog u tabu „Nalozi“.
                  </p>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Br.</th>
                        <th>Datum</th>
                        <th>Vrsta</th>
                        <th>Opis</th>
                        <th>Duguje</th>
                        <th>Potražuje</th>
                        <th>Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.rows.map((r) => (
                        <tr
                          key={r.entryId}
                          onClick={() => openEntryById(r.entryId)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="mono">{r.entryNo ?? '—'}</td>
                          <td className="mono">{r.bookingDate}</td>
                          <td>{entryTypeLabel(r.entryType)}</td>
                          <td>{r.description}</td>
                          <td className="mono">{r.debit}</td>
                          <td className="mono">{r.credit}</td>
                          <td className="mono">{r.balance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {tab === 'trial' && entityId ? (
        <div className="card">
          <h2>Bruto bilans</h2>
          <p className="page-sub" style={{ marginTop: 0 }}>
            Izvještaj — ne mijenja knjigu.
          </p>
          <div className="spread" style={{ gap: 8 }}>
            <input
              className="input"
              type="date"
              style={{ maxWidth: 160 }}
              value={cardFrom}
              onChange={(e) => setCardFrom(e.target.value)}
            />
            <input
              className="input"
              type="date"
              style={{ maxWidth: 160 }}
              value={cardTo}
              onChange={(e) => setCardTo(e.target.value)}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await api<TrialView>(
                    'GET',
                    `/api/v1/ledger/reports/trial-balance?legalEntityId=${entityId}&from=${cardFrom}&to=${cardTo}`,
                  );
                  setTrial(r);
                }, null)
              }
            >
              Prikaži
            </button>
          </div>
          {busy && !trial ? <LoadingState text="Učitavanje bruto bilansa…" /> : null}
          {!trial && !busy ? <EmptyState text="Odaberite period pa kliknite „Prikaži“." /> : null}
          {trial ? (
            trial.rows.length === 0 ? (
              <EmptyState text="Nema knjiženja u knjizi." />
            ) : (
              <>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                  Klik na konto otvara njegovu karticu.
                </p>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Konto</th>
                      <th>Naziv</th>
                      <th>PS</th>
                      <th>Duguje</th>
                      <th>Potražuje</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trial.rows.map((r) => (
                      <tr
                        key={r.accountId}
                        onClick={() => {
                          setCardAccountId(r.accountId);
                          setCard(null);
                          setTab('card');
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="mono">{r.code}</td>
                        <td>{r.name}</td>
                        <td className="mono">{r.opening}</td>
                        <td className="mono">{r.debit}</td>
                        <td className="mono">{r.credit}</td>
                        <td className="mono">{r.closing}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2}>
                        <strong>Ukupno</strong>
                      </td>
                      <td className="mono">
                        <strong>{trial.totals.opening}</strong>
                      </td>
                      <td className="mono">
                        <strong>{trial.totals.debit}</strong>
                      </td>
                      <td className="mono">
                        <strong>{trial.totals.credit}</strong>
                      </td>
                      <td className="mono">
                        <strong>{trial.totals.closing}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            )
          ) : null}
        </div>
      ) : null}

      {open ? (
        <ConfirmDialog
          open={confirmPost}
          title="Proknjiži nalog"
          consequence="Proknjižen nalog je nepromjenjiv — jedina ispravka je zrcalni storno."
          confirmLabel="Proknjiži"
          busy={busy}
          onCancel={() => setConfirmPost(false)}
          onConfirm={() =>
            void run(async () => {
              await api('POST', `/api/v1/ledger/entries/${open.id}/post`);
              setOpen(null);
            }, 'Nalog je proknjižen.').then(() => setConfirmPost(false))
          }
        >
          <div className="fact">
            <span>Pravno lice</span>
            <span>{entityName}</span>
          </div>
          <div className="fact">
            <span>Datum knjiženja</span>
            <span>{open.bookingDate}</span>
          </div>
          <div className="fact">
            <span>Tip naloga</span>
            <span>{entryTypeLabel(open.entryType)}</span>
          </div>
          <div className="fact">
            <span>Opis</span>
            <span>{open.description}</span>
          </div>
          <div className="fact">
            <span>Ukupno duguje</span>
            <span className="mono">{open.totalDebit}</span>
          </div>
          <div className="fact">
            <span>Ukupno potražuje</span>
            <span className="mono">{open.totalCredit}</span>
          </div>
        </ConfirmDialog>
      ) : null}

      {open ? (
        <ConfirmDialog
          open={confirmStorno}
          title="Storniraj nalog"
          consequence="Kreira se i knjiži zrcalni STORNO nalog; original ostaje u knjizi."
          confirmLabel="Storniraj"
          danger
          busy={busy}
          onCancel={() => {
            setConfirmStorno(false);
            setStornoReason('');
          }}
          onConfirm={() => {
            if (stornoReason.trim().length < 5) return;
            void run(async () => {
              await api('POST', `/api/v1/ledger/entries/${open.id}/storno`, {
                reason: stornoReason,
              });
              setStornoReason('');
              setOpen(null);
            }, 'Storno nalog je kreiran i proknjižen.').then(() => setConfirmStorno(false));
          }}
        >
          <div className="fact">
            <span>Nalog br.</span>
            <span className="mono">{open.entryNo ?? '—'}</span>
          </div>
          <div className="fact">
            <span>Pravno lice</span>
            <span>{entityName}</span>
          </div>
          <div className="fact">
            <span>Datum knjiženja</span>
            <span>{open.bookingDate}</span>
          </div>
          <div className="fact">
            <span>Tip naloga</span>
            <span>{entryTypeLabel(open.entryType)}</span>
          </div>
          <div className="fact">
            <span>Opis</span>
            <span>{open.description}</span>
          </div>
          <div className="fact">
            <span>Ukupno duguje / potražuje</span>
            <span className="mono">
              {open.totalDebit} / {open.totalCredit}
            </span>
          </div>
          <label className="label">Razlog storna (obavezno)</label>
          <input
            className="input"
            value={stornoReason}
            onChange={(e) => setStornoReason(e.target.value)}
            placeholder="min. 5 znakova"
          />
          {stornoReason.trim().length < 5 ? (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              Razlog je obavezan — najmanje 5 znakova.
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </main>
  );
}

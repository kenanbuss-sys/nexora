'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../../lib/api';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '../../../components/ui';

/**
 * MDM-005 — steward screen for duplicate candidates. The server finds the
 * candidate groups, computes the merge preview (differences, what moves,
 * blockers) and performs the merge; this card only lets the steward pick
 * the surviving record and the fields to take from the duplicate.
 */

type Reason = 'NAME' | 'TAX_ID' | 'EMAIL';
type MergeField = 'name' | 'email' | 'taxId';

interface CandidateParty {
  id: string;
  partyType?: string;
  name?: string | null;
  email?: string | null;
  taxId?: string | null;
  status?: string;
  mergedIntoId?: string | null;
}

interface CandidateGroup {
  reason: Reason;
  key: string;
  parties: CandidateParty[];
}

interface MergePreview {
  winner: CandidateParty;
  loser: CandidateParty;
  differences: Array<{ field: MergeField; winner: string | null; loser: string | null }>;
  moves: { externalIdentities: number; redirects: number };
  stays: { consents: number };
  blockers: string[];
}

const REASON_LABELS: Record<Reason, string> = {
  NAME: 'Isti naziv (bez pravnog oblika)',
  TAX_ID: 'Isti PIB/JIB',
  EMAIL: 'Isti e-mail',
};

const FIELD_LABELS: Record<MergeField, string> = {
  name: 'Naziv',
  email: 'E-mail',
  taxId: 'Porezni broj',
};

const PARTY_TYPE_LABELS: Record<string, string> = {
  ORGANIZATION: 'Organizacija',
  PERSON: 'Fizičko lice',
};

/** Server blockers are technical English; known ones get a Bosnian label. */
const BLOCKER_LABELS: Record<string, string> = {
  'The surviving party is not active': 'Zapis koji ostaje nije aktivan.',
  'The duplicate is already merged': 'Duplikat je već spojen.',
  'A person cannot be merged with an organisation':
    'Fizičko lice se ne može spojiti sa organizacijom.',
};

function partyLabel(p: CandidateParty | undefined): string {
  if (!p) return '—';
  return p.name ?? `#${p.id.slice(0, 8)}`;
}

function partyDetails(p: CandidateParty): string {
  return [
    p.partyType ? (PARTY_TYPE_LABELS[p.partyType] ?? p.partyType) : null,
    p.taxId ? `PIB/JIB ${p.taxId}` : null,
    p.email ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function GroupRow({
  group,
  canMerge,
  busy,
  onMerge,
  onDismiss,
}: {
  group: CandidateGroup;
  canMerge: boolean;
  busy: boolean;
  onMerge: (winnerId: string, loserId: string) => void;
  onDismiss: (a: CandidateParty, b: CandidateParty) => void;
}) {
  const active = group.parties.filter((p) => !p.status || p.status === 'ACTIVE');
  const [winnerId, setWinnerId] = useState(active[0]?.id ?? '');
  const [loserId, setLoserId] = useState(active[1]?.id ?? '');
  const groupId = `dup-${group.reason}-${group.key}`;
  const winner = group.parties.find((p) => p.id === winnerId);
  const loser = group.parties.find((p) => p.id === loserId);
  const pairOk = !!winner && !!loser && winner.id !== loser.id;

  return (
    <div
      style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, marginTop: 10 }}
      role="group"
      aria-labelledby={`${groupId}-title`}
    >
      <div className="row spread" style={{ flexWrap: 'wrap', gap: 6 }}>
        <strong id={`${groupId}-title`}>{group.key}</strong>
        <span className="badge badge-info">{REASON_LABELS[group.reason] ?? group.reason}</span>
      </div>
      <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
        {group.parties.map((p) => (
          <li key={p.id} style={{ fontSize: 13 }}>
            {partyLabel(p)}{' '}
            <span className="muted" style={{ fontSize: 12 }}>
              {partyDetails(p)}
            </span>
            {p.status === 'MERGED' ? <span className="badge"> spojen</span> : null}
          </li>
        ))}
      </ul>
      {active.length < 2 ? (
        <p className="muted" style={{ fontSize: 12 }}>
          U grupi je manje od dva aktivna zapisa — nema para za spajanje.
        </p>
      ) : (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <select
            id={`${groupId}-winner`}
            className="select"
            style={{ maxWidth: 200 }}
            value={winnerId}
            onChange={(e) => {
              setWinnerId(e.target.value);
              if (e.target.value === loserId) setLoserId('');
            }}
            title="Zapis koji ostaje"
            aria-label="Zapis koji ostaje"
          >
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                Ostaje: {partyLabel(p)}
              </option>
            ))}
          </select>
          <select
            id={`${groupId}-loser`}
            className="select"
            style={{ maxWidth: 200 }}
            value={loserId}
            onChange={(e) => setLoserId(e.target.value)}
            title="Duplikat"
            aria-label="Duplikat"
          >
            <option value="">Duplikat…</option>
            {active
              .filter((p) => p.id !== winnerId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  Duplikat: {partyLabel(p)}
                </option>
              ))}
          </select>
          {canMerge ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy || !pairOk}
              title={pairOk ? undefined : 'Odaberite zapis koji ostaje i duplikat'}
              onClick={() => onMerge(winnerId, loserId)}
            >
              Spoji…
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || !pairOk}
            title={pairOk ? undefined : 'Odaberite oba zapisa para'}
            onClick={() => winner && loser && onDismiss(winner, loser)}
          >
            Nije duplikat
          </button>
        </div>
      )}
    </div>
  );
}

function MergeDialog({
  winnerId,
  loserId,
  onClose,
  onMerged,
}: {
  winnerId: string;
  loserId: string;
  onClose: () => void;
  onMerged: (message: string) => void;
}) {
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [take, setTake] = useState<MergeField[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<MergePreview>(
      'GET',
      `/api/v1/parties/merge-preview?winnerId=${encodeURIComponent(winnerId)}&loserId=${encodeURIComponent(loserId)}`,
    )
      .then((r) => {
        if (!cancelled) setPreview(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(errorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [winnerId, loserId]);

  async function merge() {
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/v1/parties/merge', {
        winnerId,
        loserId,
        ...(take.length > 0 ? { takeFromLoser: take } : {}),
      });
      onMerged(
        `Partner "${partyLabel(preview?.loser)}" je spojen u "${partyLabel(preview?.winner)}".`,
      );
    } catch (e: unknown) {
      setError(errorText(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const blocked = !!preview && preview.blockers.length > 0;

  return (
    <>
      <div
        className="dialog-scrim"
        role="presentation"
        onClick={busy ? undefined : onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onClose();
        }}
      >
        <div
          className="dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Spajanje partnera"
          onClick={(e) => e.stopPropagation()}
        >
          <h2>Spajanje partnera</h2>
          <div className="dialog-body">
            {loadError ? <ErrorState text={loadError} /> : null}
            {error ? <ErrorState text={error} /> : null}
            {!loadError && !preview ? <LoadingState text="Učitavanje pregleda spajanja…" /> : null}
            {preview ? (
              <>
                <div className="fact">
                  <span>Ostaje</span>
                  <span>{partyLabel(preview.winner)}</span>
                </div>
                <div className="fact">
                  <span>Duplikat (biće spojen)</span>
                  <span>{partyLabel(preview.loser)}</span>
                </div>

                <h3 style={{ margin: '12px 0 6px', fontSize: 14 }}>Razlike</h3>
                {preview.differences.length === 0 ? (
                  <EmptyState text="Nema razlika u vidljivim poljima." />
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Polje</th>
                        <th>Ostaje</th>
                        <th>Duplikat</th>
                        <th>Preuzmi od duplikata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.differences.map((d) => {
                        const id = `take-${d.field}`;
                        return (
                          <tr key={d.field}>
                            <td>{FIELD_LABELS[d.field] ?? d.field}</td>
                            <td>{d.winner ?? '—'}</td>
                            <td>{d.loser ?? '—'}</td>
                            <td>
                              <input
                                id={id}
                                type="checkbox"
                                aria-label={`Preuzmi od duplikata: ${FIELD_LABELS[d.field] ?? d.field}`}
                                checked={take.includes(d.field)}
                                disabled={busy || blocked}
                                onChange={(e) =>
                                  setTake((prev) =>
                                    e.target.checked
                                      ? [...prev, d.field]
                                      : prev.filter((f) => f !== d.field),
                                  )
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                <h3 style={{ margin: '12px 0 6px', fontSize: 14 }}>Šta se prenosi</h3>
                <div className="fact">
                  <span>Vanjski identifikatori (prelaze na zapis koji ostaje)</span>
                  <span className="mono">{preview.moves.externalIdentities}</span>
                </div>
                <div className="fact">
                  <span>Preusmjerenja (prelaze na zapis koji ostaje)</span>
                  <span className="mono">{preview.moves.redirects}</span>
                </div>
                <div className="fact">
                  <span>Saglasnosti (ostaju uz duplikat kao istorija)</span>
                  <span className="mono">{preview.stays.consents}</span>
                </div>

                {blocked ? (
                  <div className="alert alert-error" role="alert" style={{ marginTop: 10 }}>
                    <strong>Spajanje nije moguće:</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {preview.blockers.map((b) => (
                        <li key={b}>{BLOCKER_LABELS[b] ?? b}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Zatvori
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !preview || blocked}
              title={blocked ? 'Spajanje je blokirano — vidi razloge iznad' : undefined}
              onClick={() => setConfirming(true)}
            >
              Spoji
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirming && !!preview}
        title="Potvrda spajanja"
        consequence="Duplikat postaje spojen zapis i preusmjerava na zapis koji ostaje. Radnja se evidentira u reviziji."
        confirmLabel="Potvrdi spajanje"
        danger
        busy={busy}
        onConfirm={() => void merge()}
        onCancel={() => setConfirming(false)}
      >
        <div className="fact">
          <span>Ostaje</span>
          <span>{partyLabel(preview?.winner)}</span>
        </div>
        <div className="fact">
          <span>Duplikat</span>
          <span>{partyLabel(preview?.loser)}</span>
        </div>
        <div className="fact">
          <span>Preuzima se od duplikata</span>
          <span>{take.length > 0 ? take.map((f) => FIELD_LABELS[f]).join(', ') : 'ništa'}</span>
        </div>
      </ConfirmDialog>
    </>
  );
}

export function DuplicateCandidatesCard({
  canMerge,
  onChanged,
}: {
  canMerge: boolean;
  onChanged: () => void;
}) {
  const [groups, setGroups] = useState<CandidateGroup[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mergePair, setMergePair] = useState<{ winnerId: string; loserId: string } | null>(null);
  const [dismissPair, setDismissPair] = useState<{
    a: CandidateParty;
    b: CandidateParty;
  } | null>(null);
  const [dismissNote, setDismissNote] = useState('');

  const load = useCallback(() => {
    api<{ groups: CandidateGroup[] }>('GET', '/api/v1/parties/duplicate-candidates')
      .then((r) => {
        setGroups(r.groups);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(errorText(e)));
  }, []);

  useEffect(load, [load]);

  async function dismiss() {
    if (!dismissPair) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api('POST', '/api/v1/parties/duplicate-candidates/dismiss', {
        partyAId: dismissPair.a.id,
        partyBId: dismissPair.b.id,
        ...(dismissNote.trim() ? { note: dismissNote.trim() } : {}),
      });
      setNotice('Par je označen kao "nije duplikat".');
      setDismissPair(null);
      setDismissNote('');
      load();
    } catch (e: unknown) {
      setError(errorText(e));
      setDismissPair(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Mogući duplikati</h2>
      <p className="muted">
        Kandidati prema nazivu, PIB/JIB-u i e-mailu. Odaberite zapis koji ostaje i duplikat;
        spajanje prikazuje pregled prije potvrde.
      </p>
      {loadError ? <ErrorState text={loadError} /> : null}
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}
      {!loadError && groups === null ? <LoadingState text="Traženje duplikata…" /> : null}
      {groups && groups.length === 0 ? (
        <EmptyState text="Nema mogućih duplikata — matični podaci su uredni." />
      ) : null}
      {groups?.map((g) => (
        <GroupRow
          key={`${g.reason}:${g.key}:${g.parties.map((p) => p.id).join(',')}`}
          group={g}
          canMerge={canMerge}
          busy={busy}
          onMerge={(winnerId, loserId) => {
            setError(null);
            setNotice(null);
            setMergePair({ winnerId, loserId });
          }}
          onDismiss={(a, b) => {
            setError(null);
            setNotice(null);
            setDismissNote('');
            setDismissPair({ a, b });
          }}
        />
      ))}

      {mergePair ? (
        <MergeDialog
          key={`${mergePair.winnerId}:${mergePair.loserId}`}
          winnerId={mergePair.winnerId}
          loserId={mergePair.loserId}
          onClose={() => setMergePair(null)}
          onMerged={(message) => {
            setMergePair(null);
            setNotice(message);
            load();
            onChanged();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!dismissPair}
        title="Nije duplikat"
        consequence="Par se više neće predlagati kao mogući duplikat. Odluka se evidentira."
        confirmLabel="Označi kao različite"
        busy={busy}
        onConfirm={() => void dismiss()}
        onCancel={() => setDismissPair(null)}
      >
        <div className="fact">
          <span>Zapis A</span>
          <span>{partyLabel(dismissPair?.a)}</span>
        </div>
        <div className="fact">
          <span>Zapis B</span>
          <span>{partyLabel(dismissPair?.b)}</span>
        </div>
        <label className="label" htmlFor="dismiss-note">
          Napomena (opciono)
        </label>
        <input
          id="dismiss-note"
          className="input"
          value={dismissNote}
          maxLength={500}
          onChange={(e) => setDismissNote(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}

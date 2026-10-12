'use client';

import { useEffect, useState } from 'react';
import { ApiRequestError, api, errorText } from '../../../lib/api';
import { ConfirmDialog, ErrorState, LoadingState } from '../../../components/ui';

/**
 * HCM-018 (Sprint 253): links the app user that signs in as this employee
 * ("Moj HR"). Uniqueness (one employee per user), tenant checks and the
 * audit trail are enforced on the server; this control only shows the
 * current link and asks for confirmation before changing it.
 */

interface UserOption {
  id: string;
  email: string;
  displayName: string;
}

interface Props {
  employee: { id: string; name: string; userId: string | null };
  canManage: boolean;
  onChanged: () => void;
}

export function EmployeeUserLink({ employee, canManage, onChanged }: Props) {
  const [users, setUsers] = useState<UserOption[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>(employee.userId ?? '');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    api<{ users: UserOption[] }>('GET', '/api/v1/users')
      .then((r) => setUsers(r.users))
      .catch((e: unknown) => {
        if (e instanceof ApiRequestError && e.status === 403) setForbidden(true);
        else setLoadError(errorText(e));
      });
  }, [canManage]);

  useEffect(() => setChoice(employee.userId ?? ''), [employee.userId]);

  if (!canManage) return null;

  const label = (id: string | null) => {
    if (!id) return 'Nije povezan';
    const u = (users ?? []).find((x) => x.id === id);
    return u ? `${u.displayName} (${u.email})` : 'Povezan (korisnik nije u listi)';
  };

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api('POST', `/api/v1/employees/${employee.id}/user`, { userId: choice || null });
      setNotice(
        choice ? 'Korisnički nalog je povezan.' : 'Veza s korisničkim nalogom je uklonjena.',
      );
      setConfirm(false);
      onChanged();
    } catch (e: unknown) {
      setError(
        e instanceof ApiRequestError && e.status === 409
          ? 'Veza nije moguća: korisnik je već povezan s drugim zaposlenim, ovaj zaposleni već ima nalog (prvo uklonite vezu) ili korisnik nije aktivan.'
          : e instanceof ApiRequestError && e.status === 403
            ? 'Povezivanje otvara dokumente i platu zaposlenog, pa traži prava hcm.docs.manage i hcm.salary.read (za zaključane i hcm.salary.management). Svoj nalog ne možete povezati sami — to radi druga osoba iz HR-a.'
            : errorText(e),
      );
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h3 style={{ marginTop: 16, marginBottom: 6 }}>Korisnički nalog (Moj HR)</h3>
      {forbidden ? (
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
          Povezivanje zahtijeva i dozvolu za upravljanje korisnicima (iam.user.manage) — obratite se
          administratoru.
        </p>
      ) : loadError ? (
        <ErrorState text={loadError} />
      ) : users === null ? (
        <LoadingState text="Učitavanje korisnika…" />
      ) : (
        <>
          <div className="fact">
            <span>Povezani nalog</span>
            <span style={{ overflowWrap: 'anywhere', textAlign: 'right' }}>
              {label(employee.userId)}
            </span>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <select
              className="select"
              style={{ maxWidth: 280 }}
              aria-label="Korisnički nalog zaposlenog"
              value={choice}
              disabled={busy}
              onChange={(e) => setChoice(e.target.value)}
            >
              <option value="">— bez naloga —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({u.email})
                </option>
              ))}
            </select>
            <button
              className="btn btn-sm"
              type="button"
              disabled={busy || choice === (employee.userId ?? '')}
              title={choice === (employee.userId ?? '') ? 'Izaberite drugi nalog' : undefined}
              onClick={() => setConfirm(true)}
            >
              {choice ? 'Poveži nalog' : 'Ukloni vezu'}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
            Povezani korisnik u ekranu Moj HR vidi samo podatke ovog zaposlenog.
          </p>
        </>
      )}
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <ConfirmDialog
        open={confirm}
        title={choice ? 'Povezivanje korisničkog naloga' : 'Uklanjanje veze s nalogom'}
        consequence={
          choice
            ? 'Korisnik će u Moj HR vidjeti šihtaricu, odsustva, ugovore i dokumente ovog zaposlenog.'
            : 'Korisnik gubi pristup podacima ovog zaposlenog u Moj HR.'
        }
        confirmLabel={choice ? 'Poveži' : 'Ukloni vezu'}
        danger={!choice}
        busy={busy}
        onConfirm={() => void save()}
        onCancel={() => setConfirm(false)}
      >
        <div className="fact">
          <span>Zaposleni</span>
          <span>{employee.name}</span>
        </div>
        <div className="fact">
          <span>Trenutno</span>
          <span style={{ textAlign: 'right' }}>{label(employee.userId)}</span>
        </div>
        <div className="fact">
          <span>Novo</span>
          <span style={{ textAlign: 'right' }}>{label(choice || null)}</span>
        </div>
      </ConfirmDialog>
    </>
  );
}

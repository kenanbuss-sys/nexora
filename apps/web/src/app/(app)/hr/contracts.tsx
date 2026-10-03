'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiRequestError, errorText } from '../../../lib/api';
import { submissionResolvedByError } from '../../../lib/idempotency';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '../../../components/ui';

/**
 * HCM-016 (Sprint 236) — employment contracts from document templates,
 * expiry alerts and expiry tasks. The text is generated and locked on the
 * server (immutable); salary placeholders, the salary contract scope and
 * the management lock are enforced there. This component only renders
 * the server's answers and sends commands — authority is server-side
 * (hcm.read / hcm.manage), the UI merely hides what the caller may not do.
 * Contract content is PLAIN TEXT and is rendered in a <pre>, never as HTML.
 */

type ContractType = 'INDEFINITE' | 'FIXED_TERM';
type ContractStatus = 'ISSUED' | 'TERMINATED';

export interface ContractEmployeeOption {
  id: string;
  employeeNumber: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

interface ContractView {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  contractNumber: string;
  contractType: ContractType;
  startDate: string;
  endDate: string | null;
  position: string | null;
  templateKey: string;
  templateVersion: number;
  containsSalary: boolean;
  status: ContractStatus;
  terminatedOn: string | null;
  terminationReason: string | null;
  restricted: boolean;
  content: string | null;
}

interface ExpiringContract {
  id: string;
  contractNumber: string;
  employeeId: string;
  employeeName: string;
  endDate: string;
  daysLeft: number;
  taskId: string | null;
}

interface ExpiringView {
  asOf: string;
  days: number;
  contracts: ExpiringContract[];
}

interface TemplateOption {
  key: string;
  name: string;
  status: string;
  latestVersion: number;
}

interface ContractBody {
  employeeId: string;
  templateKey: string;
  contractType: ContractType;
  startDate: string;
  endDate?: string;
  position?: string;
}

const TYPE_LABEL: Record<ContractType, string> = {
  INDEFINITE: 'Neodređeno',
  FIXED_TERM: 'Određeno',
};

const STATUS_LABEL: Record<ContractStatus, string> = {
  ISSUED: 'Važeći',
  TERMINATED: 'Raskinut',
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * API error text. A 403 carries the missing scope (e.g. the salary
 * contract scope) in the server message — shown as-is so the person
 * knows what to ask for.
 */
export function hcmErrorText(e: unknown): string {
  if (e instanceof ApiRequestError && (e.status === 403 || e.body.code === 'FORBIDDEN')) {
    return `Nemate pravo za ovu radnju: ${e.body.message}`;
  }
  return errorText(e);
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function daysBadge(daysLeft: number): string {
  if (daysLeft <= 7) return 'badge-danger';
  if (daysLeft <= 30) return 'badge-warn';
  return 'badge-info';
}

export function EmploymentContracts({
  employees,
  canManage,
}: {
  employees: ContractEmployeeOption[] | null;
  canManage: boolean;
}) {
  const [contracts, setContracts] = useState<ContractView[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState('');

  const [expiring, setExpiring] = useState<ExpiringView | null>(null);
  const [expiringError, setExpiringError] = useState<string | null>(null);
  const [expiryDays, setExpiryDays] = useState('');

  const [placeholders, setPlaceholders] = useState<string[] | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ContractView | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);

  // New contract form. One idempotency key per intended contract: after an
  // uncertain outcome the key AND the submitted content are kept until the
  // submission resolves — a later form edit can never silently turn the
  // retry into a second contract (the retry resends the pending content).
  const [fEmployeeId, setFEmployeeId] = useState('');
  const [fTemplateKey, setFTemplateKey] = useState('');
  const [fType, setFType] = useState<ContractType>('INDEFINITE');
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fPosition, setFPosition] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);
  const pendingRef = useRef<{ key: string; body: ContractBody } | null>(null);
  const [hasPending, setHasPending] = useState(false);

  // Termination.
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [terminatedOn, setTerminatedOn] = useState(today());
  const [terminateReason, setTerminateReason] = useState('');
  const [confirmScan, setConfirmScan] = useState(false);

  const loadContracts = useCallback(() => {
    const q = employeeFilter ? `?employeeId=${encodeURIComponent(employeeFilter)}` : '';
    api<{ contracts: ContractView[] }>('GET', `/api/v1/hcm/contracts${q}`)
      .then((r) => {
        setContracts(r.contracts);
        setListError(null);
      })
      .catch((e: unknown) => {
        setContracts([]);
        setListError(hcmErrorText(e));
      });
  }, [employeeFilter]);

  const loadExpiring = useCallback(() => {
    const q = expiryDays ? `?days=${encodeURIComponent(expiryDays)}` : '';
    api<ExpiringView>('GET', `/api/v1/hcm/contracts/expiring${q}`)
      .then((r) => {
        setExpiring(r);
        setExpiringError(null);
      })
      .catch((e: unknown) => setExpiringError(hcmErrorText(e)));
  }, [expiryDays]);

  useEffect(loadContracts, [loadContracts]);
  useEffect(loadExpiring, [loadExpiring]);

  useEffect(() => {
    api<{ placeholders: string[] }>('GET', '/api/v1/hcm/contracts/placeholders')
      .then((r) => setPlaceholders(r.placeholders))
      .catch(() => setPlaceholders([]));
  }, []);

  useEffect(() => {
    if (!canManage) return;
    api<{ templates: TemplateOption[] }>('GET', '/api/v1/document-templates')
      .then((r) => {
        setTemplates(r.templates.filter((t) => t.status === 'ACTIVE'));
        setTemplatesError(null);
      })
      .catch((e: unknown) => {
        // Without document.read the key is typed by hand; the server
        // still validates the template (inactive → 409).
        setTemplates(null);
        setTemplatesError(hcmErrorText(e));
      });
  }, [canManage]);

  async function run(fn: () => Promise<unknown>, successText: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successText) setNotice(successText);
      loadContracts();
      loadExpiring();
    } catch (e: unknown) {
      setError(hcmErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  function openContract(c: ContractView) {
    setSelected(c);
    setDetailError(null);
    setConfirmTerminate(false);
    api<ContractView>('GET', `/api/v1/hcm/contracts/${c.id}`)
      .then((r) => setSelected(r))
      .catch((e: unknown) => setDetailError(hcmErrorText(e)));
  }

  function currentBody(): ContractBody {
    return {
      employeeId: fEmployeeId,
      templateKey: fTemplateKey.trim(),
      contractType: fType,
      startDate: fStart,
      ...(fType === 'FIXED_TERM' && fEnd ? { endDate: fEnd } : {}),
      ...(fPosition.trim() ? { position: fPosition.trim() } : {}),
    };
  }

  const employeeLabel = (id: string) => {
    const e = (employees ?? []).find((x) => x.id === id);
    return e ? `${e.employeeNumber} — ${e.name}` : id;
  };

  const formIncomplete =
    !fEmployeeId ||
    !fTemplateKey.trim() ||
    !fStart ||
    (fType === 'FIXED_TERM' && (!fEnd || fEnd < fStart));
  const formHint = !fEmployeeId
    ? 'Odaberite zaposlenog'
    : !fTemplateKey.trim()
      ? 'Odaberite šablon'
      : !fStart
        ? 'Unesite datum početka'
        : fType === 'FIXED_TERM' && !fEnd
          ? 'Ugovor na određeno zahtijeva datum završetka'
          : fType === 'FIXED_TERM' && fEnd < fStart
            ? 'Datum završetka je prije datuma početka'
            : null;

  const dialogBody = pendingRef.current?.body ?? currentBody();

  const columns: Array<Column<ContractView>> = [
    {
      key: 'number',
      header: 'Broj',
      render: (c) => <span className="mono">{c.contractNumber}</span>,
      text: (c) => c.contractNumber,
    },
    {
      key: 'employee',
      header: 'Zaposleni',
      render: (c) => c.employeeName,
      text: (c) => `${c.employeeName} ${c.employeeNumber}`,
    },
    {
      key: 'type',
      header: 'Vrsta',
      render: (c) => TYPE_LABEL[c.contractType],
      text: (c) => TYPE_LABEL[c.contractType],
    },
    {
      key: 'from',
      header: 'Od',
      render: (c) => <span className="mono">{c.startDate}</span>,
      text: (c) => c.startDate,
    },
    {
      key: 'to',
      header: 'Do',
      render: (c) =>
        c.endDate ? <span className="mono">{c.endDate}</span> : <span className="muted">—</span>,
      text: (c) => c.endDate ?? '',
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <span className={`badge ${c.status === 'ISSUED' ? 'badge-ok' : 'badge-danger'}`}>
          {STATUS_LABEL[c.status]}
        </span>
      ),
      text: (c) => STATUS_LABEL[c.status],
    },
    {
      key: 'template',
      header: 'Šablon',
      align: 'right',
      render: (c) => (
        <span className="mono">
          {c.templateKey} v{c.templateVersion}
        </span>
      ),
      text: (c) => c.templateKey,
    },
  ];

  return (
    <>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="spread" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ marginBottom: 0 }}>Ističu uskoro</h2>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <select
              className="select"
              style={{ maxWidth: 170 }}
              aria-label="Period isticanja"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
            >
              <option value="">Zadani period</option>
              <option value="7">7 dana</option>
              <option value="30">30 dana</option>
              <option value="60">60 dana</option>
              <option value="90">90 dana</option>
            </select>
            {canManage ? (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy}
                onClick={() => setConfirmScan(true)}
              >
                Kreiraj zadatke za isticanje
              </button>
            ) : null}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          {expiringError ? (
            <ErrorState text={expiringError} />
          ) : expiring === null ? (
            <LoadingState text="Učitavanje ugovora koji ističu…" />
          ) : expiring.contracts.length === 0 ? (
            <EmptyState
              text={`Nijedan ugovor ne ističe u narednih ${expiring.days} dana (stanje na ${expiring.asOf}).`}
            />
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
                Stanje na <span className="mono">{expiring.asOf}</span>, period {expiring.days}{' '}
                dana.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th>Broj</th>
                    <th>Zaposleni</th>
                    <th>Ističe</th>
                    <th>Preostalo</th>
                    <th style={{ textAlign: 'right' }}>Zadatak</th>
                  </tr>
                </thead>
                <tbody>
                  {expiring.contracts.map((c) => (
                    <tr key={c.id}>
                      <td className="mono">{c.contractNumber}</td>
                      <td>{c.employeeName}</td>
                      <td className="mono">{c.endDate}</td>
                      <td>
                        <span className={`badge ${daysBadge(c.daysLeft)}`}>
                          {c.daysLeft} {c.daysLeft === 1 ? 'dan' : 'dana'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {c.taskId ? (
                          <Link href="/tasks">Otvori zadatke</Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Ugovori o radu</h2>
          {listError ? <ErrorState text={listError} /> : null}
          {contracts === null ? (
            <LoadingState text="Učitavanje ugovora…" />
          ) : (
            <DataTable
              columns={columns}
              rows={contracts}
              rowKey={(c) => c.id}
              onRowClick={openContract}
              searchPlaceholder="Pretraga ugovora…"
              emptyText={
                employeeFilter ? 'Odabrani zaposleni nema ugovora.' : 'Još nema ugovora o radu.'
              }
              toolbar={
                <select
                  className="select"
                  style={{ maxWidth: 220 }}
                  aria-label="Filter po zaposlenom"
                  value={employeeFilter}
                  onChange={(e) => setEmployeeFilter(e.target.value)}
                >
                  <option value="">Svi zaposleni</option>
                  {(employees ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.employeeNumber} — {e.name}
                    </option>
                  ))}
                </select>
              }
            />
          )}
          {contracts !== null && contracts.length === 0 && employeeFilter ? (
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setEmployeeFilter('')}
            >
              Prikaži sve zaposlene
            </button>
          ) : null}
        </div>

        <div className="card">
          <h2>Ugovor</h2>
          {!selected ? (
            <EmptyState text="Odaberite ugovor iz liste." />
          ) : (
            <>
              {detailError ? <ErrorState text={detailError} /> : null}
              <Fact label="Broj">
                <span className="mono">{selected.contractNumber}</span>
              </Fact>
              <Fact label="Zaposleni">
                {selected.employeeName} (<span className="mono">{selected.employeeNumber}</span>)
              </Fact>
              <Fact label="Vrsta">{TYPE_LABEL[selected.contractType]}</Fact>
              <Fact label="Period">
                <span className="mono">
                  {selected.startDate} → {selected.endDate ?? '—'}
                </span>
              </Fact>
              <Fact label="Pozicija">{selected.position ?? '—'}</Fact>
              <Fact label="Šablon">
                <span className="mono">
                  {selected.templateKey} v{selected.templateVersion}
                </span>
              </Fact>
              <Fact label="Status">
                <span
                  className={`badge ${selected.status === 'ISSUED' ? 'badge-ok' : 'badge-danger'}`}
                >
                  {STATUS_LABEL[selected.status]}
                </span>
              </Fact>
              {selected.status === 'TERMINATED' ? (
                <>
                  <Fact label="Raskinut">
                    <span className="mono">{selected.terminatedOn ?? '—'}</span>
                  </Fact>
                  <Fact label="Razlog">{selected.terminationReason ?? '—'}</Fact>
                </>
              ) : null}

              <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={selected.restricted || selected.content === null}
                  title={selected.restricted ? 'Sadržaj nije dostupan uz vaša prava' : undefined}
                  onClick={() => window.print()}
                >
                  Štampaj
                </button>
                {canManage && selected.status === 'ISSUED' ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={busy}
                    onClick={() => {
                      setTerminatedOn(today());
                      setTerminateReason('');
                      setConfirmTerminate(true);
                    }}
                  >
                    Raskini
                  </button>
                ) : null}
              </div>

              <h3 style={{ marginTop: 16, marginBottom: 6 }}>Tekst ugovora</h3>
              {selected.restricted || selected.content === null ? (
                <EmptyState text="Sadržaj sadrži platu — potrebno pravo hcm.salary.contract (ili je zaposleni pod zaštitom uprave)." />
              ) : (
                <pre
                  className="mono"
                  style={{
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    fontSize: 12.5,
                    margin: 0,
                  }}
                >
                  {selected.content}
                </pre>
              )}
              <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
                Tekst je zaključan (nepromjenjiv); ispravka = raskid + novi ugovor.
              </p>
            </>
          )}
        </div>
      </div>

      {canManage ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Novi ugovor</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
            Tekst se generiše iz aktivnog šablona dokumenata i zaključava.
          </p>
          {placeholders && placeholders.length > 0 ? (
            <p className="muted" style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>
              Dozvoljena polja u šablonu:{' '}
              <span className="mono">{placeholders.map((p) => `{{${p}}}`).join(' ')}</span>. Polja
              salary.* zahtijevaju pravo hcm.salary.contract.
            </p>
          ) : null}
          {hasPending ? (
            <p className="alert alert-warn">
              Prethodni ugovor nije potvrđen od servera. Ponovno slanje šalje RANIJE PREDANI sadržaj
              pod istim ključem (bez duplikata); izmjene forme idu u novi ugovor nakon razrješenja.
            </p>
          ) : null}

          <div className="grid-2">
            <div>
              <label className="label" htmlFor="ct-employee">
                Zaposleni
              </label>
              <select
                id="ct-employee"
                className="select"
                value={fEmployeeId}
                onChange={(e) => setFEmployeeId(e.target.value)}
              >
                <option value="">— odaberite —</option>
                {(employees ?? [])
                  .filter((e) => e.status === 'ACTIVE')
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.employeeNumber} — {e.name}
                    </option>
                  ))}
              </select>

              <label className="label" htmlFor="ct-template">
                Šablon
              </label>
              {templates !== null ? (
                <select
                  id="ct-template"
                  className="select"
                  value={fTemplateKey}
                  onChange={(e) => setFTemplateKey(e.target.value)}
                >
                  <option value="">— odaberite —</option>
                  {templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name} ({t.key} v{t.latestVersion})
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    id="ct-template"
                    className="input mono"
                    placeholder="ključ-šablona"
                    value={fTemplateKey}
                    onChange={(e) => setFTemplateKey(e.target.value)}
                  />
                  {templatesError ? (
                    <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                      Lista šablona nije dostupna ({templatesError}) — unesite ključ aktivnog
                      šablona.
                    </p>
                  ) : null}
                </>
              )}
              {templates !== null && templates.length === 0 ? (
                <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  Nema aktivnih šablona — objavite i aktivirajte šablon u modulu dokumenata.
                </p>
              ) : null}

              <label className="label" htmlFor="ct-position">
                Pozicija (opcionalno)
              </label>
              <input
                id="ct-position"
                className="input"
                maxLength={120}
                value={fPosition}
                onChange={(e) => setFPosition(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="ct-type">
                Vrsta
              </label>
              <select
                id="ct-type"
                className="select"
                value={fType}
                onChange={(e) => setFType(e.target.value as ContractType)}
              >
                <option value="INDEFINITE">Neodređeno</option>
                <option value="FIXED_TERM">Određeno</option>
              </select>

              <label className="label" htmlFor="ct-start">
                Datum početka
              </label>
              <input
                id="ct-start"
                className="input"
                type="date"
                value={fStart}
                onChange={(e) => setFStart(e.target.value)}
              />

              {fType === 'FIXED_TERM' ? (
                <>
                  <label className="label" htmlFor="ct-end">
                    Datum završetka
                  </label>
                  <input
                    id="ct-end"
                    className="input"
                    type="date"
                    value={fEnd}
                    min={fStart || undefined}
                    onChange={(e) => setFEnd(e.target.value)}
                  />
                </>
              ) : null}
            </div>
          </div>

          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || (formIncomplete && !hasPending)}
              title={!hasPending && formHint ? formHint : undefined}
              onClick={() => setConfirmNew(true)}
            >
              {hasPending ? 'Ponovi slanje' : 'Pregledaj i generiši'}
            </button>
            {!hasPending && formHint ? (
              <span className="muted" style={{ fontSize: 12.5 }}>
                {formHint}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {confirmNew ? (
        <ConfirmDialog
          open
          title={hasPending ? 'Ponovno slanje ugovora' : 'Generisanje ugovora'}
          consequence={
            hasPending
              ? 'Prethodno slanje nije potvrđeno — šalje se RANIJE PREDANI sadržaj pod istim ključem (bez duplikata).'
              : 'Tekst se generiše iz šablona i zaključava (nepromjenjiv); ispravka = raskid + novi ugovor; ako šablon sadrži platu, potrebno je pravo hcm.salary.contract.'
          }
          confirmLabel="Generiši ugovor"
          busy={busy}
          onCancel={() => setConfirmNew(false)}
          onConfirm={() =>
            void run(async () => {
              if (!pendingRef.current) {
                pendingRef.current = { key: crypto.randomUUID(), body: currentBody() };
                setHasPending(true);
              }
              const pending = pendingRef.current;
              let r: ContractView;
              try {
                r = await api<ContractView>('POST', '/api/v1/hcm/contracts', {
                  ...pending.body,
                  requestKey: pending.key,
                });
              } catch (e) {
                // Discard key+content only on a business-unambiguous
                // rejection; CONFLICT, 401/403, 5xx and network errors
                // keep them for a safe retry under the same key.
                if (
                  e instanceof ApiRequestError &&
                  submissionResolvedByError(e.status, e.body.code)
                ) {
                  pendingRef.current = null;
                  setHasPending(false);
                }
                setConfirmNew(false);
                throw e;
              }
              pendingRef.current = null;
              setHasPending(false);
              setConfirmNew(false);
              setFEmployeeId('');
              setFStart('');
              setFEnd('');
              setFPosition('');
              setSelected(r);
              setDetailError(null);
              setNotice(`Ugovor ${r.contractNumber} je generisan za ${r.employeeName}.`);
            }, null)
          }
        >
          <Fact label="Zaposleni">{employeeLabel(dialogBody.employeeId)}</Fact>
          <Fact label="Šablon">
            <span className="mono">{dialogBody.templateKey}</span>
          </Fact>
          <Fact label="Vrsta">{TYPE_LABEL[dialogBody.contractType]}</Fact>
          <Fact label="Period">
            <span className="mono">
              {dialogBody.startDate} → {dialogBody.endDate ?? '—'}
            </span>
          </Fact>
          <Fact label="Pozicija">{dialogBody.position ?? '—'}</Fact>
        </ConfirmDialog>
      ) : null}

      {confirmTerminate && selected ? (
        <ConfirmDialog
          open
          danger
          title="Raskid ugovora"
          consequence="Ugovor postaje raskinut; tekst ostaje sačuvan i nepromijenjen. Raskid se ne može poništiti — za nastavak rada izdaje se novi ugovor."
          confirmLabel="Raskini ugovor"
          busy={busy}
          onCancel={() => setConfirmTerminate(false)}
          onConfirm={() => {
            if (terminateReason.trim().length < 5 || !terminatedOn) return;
            const id = selected.id;
            void run(async () => {
              const r = await api<ContractView>('POST', `/api/v1/hcm/contracts/${id}/terminate`, {
                terminatedOn,
                reason: terminateReason.trim(),
              });
              setConfirmTerminate(false);
              setSelected(r);
              setNotice(`Ugovor ${r.contractNumber} je raskinut.`);
            }, null);
          }}
        >
          <Fact label="Ugovor">
            <span className="mono">{selected.contractNumber}</span>
          </Fact>
          <Fact label="Zaposleni">{selected.employeeName}</Fact>
          <label className="label" htmlFor="ct-term-date">
            Datum raskida
          </label>
          <input
            id="ct-term-date"
            className="input"
            type="date"
            value={terminatedOn}
            onChange={(e) => setTerminatedOn(e.target.value)}
          />
          <label className="label" htmlFor="ct-term-reason">
            Razlog (najmanje 5 znakova)
          </label>
          <input
            id="ct-term-reason"
            className="input"
            maxLength={400}
            value={terminateReason}
            onChange={(e) => setTerminateReason(e.target.value)}
          />
          {terminateReason.trim().length < 5 ? (
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              Raskid je moguć tek uz razlog od najmanje 5 znakova.
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {confirmScan ? (
        <ConfirmDialog
          open
          title="Zadaci za isticanje ugovora"
          consequence="Za svaki ugovor koji ističe kreira se jedan zadatak; ponovno pokretanje ne pravi duplikate."
          confirmLabel="Kreiraj zadatke"
          busy={busy}
          onCancel={() => setConfirmScan(false)}
          onConfirm={() =>
            void run(async () => {
              const r = await api<{ asOf: string; days: number; created: number }>(
                'POST',
                '/api/v1/hcm/contracts/expiry-scan',
                {},
              );
              setConfirmScan(false);
              setNotice(
                <>
                  Kreirano novih zadataka: {r.created} (period {r.days} dana od {r.asOf}).{' '}
                  <Link href="/tasks">Otvori zadatke</Link>
                </>,
              );
            }, null)
          }
        >
          <Fact label="Ugovora u listi">{expiring ? expiring.contracts.length : '—'}</Fact>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

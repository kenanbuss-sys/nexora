'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiRequestError } from '../../../lib/api';
import { submissionResolvedByError } from '../../../lib/idempotency';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '../../../components/ui';
import {
  CONDITION_LABEL,
  CUSTODY_STATUS,
  eamErrorText,
  Fact,
  isoDay,
  usePrint,
  useQrDataUri,
  type CustodyDetail,
  type CustodyLine,
  type CustodyStatus,
  type CustodySummary,
  type ReturnCondition,
} from './equipment-common';

/**
 * Zaduženja opreme i alata — revers (Sprint 238, EAM-015): izdavanje
 * više sredstava zaposlenom jednim dokumentom, razduženje po stavci sa
 * stanjem (ispravno / oštećeno / izgubljeno) i auditirana štampa reversa
 * s QR kodom za javnu provjeru. Sva pravila (aktivan zaposleni, već
 * zaduženo, rashodovano, idempotencija ključa) provodi server; ekran samo
 * šalje komande i prikazuje odgovore (asset.read / asset.manage).
 */

export interface CustodyAssetOption {
  id: string;
  assetNumber: string;
  name: string;
  status: 'IN_SERVICE' | 'UNDER_MAINTENANCE' | 'RETIRED';
}

interface EmployeeOption {
  id: string;
  employeeNumber: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

interface IssueBody {
  employeeId: string;
  assetIds: string[];
  note?: string;
}

const CONDITION_OPTIONS: Array<[ReturnCondition, string]> = [
  ['OK', 'Ispravno'],
  ['DAMAGED', 'Oštećeno'],
  ['LOST', 'Izgubljeno'],
];

const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');

export function EquipmentCustody({
  assets,
  canManage,
  focusId,
  onChanged,
}: {
  assets: CustodyAssetOption[] | null;
  canManage: boolean;
  /** Custody to open (e.g. from an asset's "current holder" link). */
  focusId: string | null;
  onChanged: () => void;
}) {
  const [custodies, setCustodies] = useState<CustodySummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | CustodyStatus>('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [employees, setEmployees] = useState<EmployeeOption[] | null>(null);
  const [employeesError, setEmployeesError] = useState<string | null>(null);

  const [selected, setSelected] = useState<CustodyDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New custody form; the submitted content + key survive until a clear outcome.
  const [fEmployeeId, setFEmployeeId] = useState('');
  const [fAssetIds, setFAssetIds] = useState<string[]>([]);
  const [fNote, setFNote] = useState('');
  const [assetQuery, setAssetQuery] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);
  const pendingRef = useRef<{ key: string; body: IssueBody } | null>(null);
  const [hasPending, setHasPending] = useState(false);

  const [returnFor, setReturnFor] = useState<CustodyLine | null>(null);
  const [rCondition, setRCondition] = useState<ReturnCondition>('OK');
  const [rNote, setRNote] = useState('');
  const [rError, setRError] = useState<string | null>(null);
  const [qrAction, setQrAction] = useState<'rotate' | 'revoke' | null>(null);

  const { print, portal, printing } = usePrint();

  const loadList = useCallback(() => {
    const qs = new URLSearchParams();
    if (statusFilter) qs.set('status', statusFilter);
    if (employeeFilter) qs.set('employeeId', employeeFilter);
    const q = qs.toString();
    api<{ custodies: CustodySummary[] }>('GET', `/api/v1/equipment/custody${q ? `?${q}` : ''}`)
      .then((r) => {
        setCustodies(r.custodies);
        setListError(null);
      })
      .catch((e: unknown) => {
        setCustodies([]);
        setListError(eamErrorText(e));
      });
  }, [statusFilter, employeeFilter]);
  useEffect(loadList, [loadList]);

  useEffect(() => {
    api<{ employees: EmployeeOption[] }>('GET', '/api/v1/employees')
      .then((r) => {
        setEmployees(r.employees);
        setEmployeesError(null);
      })
      .catch((e: unknown) => {
        setEmployees([]);
        setEmployeesError(eamErrorText(e));
      });
  }, []);

  const openCustody = useCallback((id: string) => {
    setDetailError(null);
    api<CustodyDetail>('GET', `/api/v1/equipment/custody/${id}`)
      .then(setSelected)
      .catch((e: unknown) => {
        setSelected(null);
        setDetailError(eamErrorText(e));
      });
  }, []);

  useEffect(() => {
    if (focusId) openCustody(focusId);
  }, [focusId, openCustody]);

  async function run(fn: () => Promise<unknown>, successText: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successText) setNotice(successText);
      loadList();
      onChanged();
    } catch (e: unknown) {
      setError(eamErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const activeEmployees = (employees ?? []).filter((e) => e.status === 'ACTIVE');

  // Filter options: known employees, plus holders seen in the list (when
  // the employee register is not readable for this role).
  const employeeFilterOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees ?? []) m.set(e.id, `${e.employeeNumber} — ${e.name}`);
    for (const c of custodies ?? []) {
      if (!m.has(c.employeeId)) m.set(c.employeeId, c.employeeName ?? c.employeeId);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [employees, custodies]);

  const employeeLabel = (id: string) => {
    const e = (employees ?? []).find((x) => x.id === id);
    return e ? `${e.employeeNumber} — ${e.name}` : id;
  };
  const assetLabel = (id: string) => {
    const a = (assets ?? []).find((x) => x.id === id);
    return a ? `${a.assetNumber} — ${a.name}` : id;
  };

  const assetOptions = useMemo(() => {
    const needle = assetQuery.trim().toLowerCase();
    return (assets ?? []).filter(
      (a) =>
        !needle ||
        a.assetNumber.toLowerCase().includes(needle) ||
        a.name.toLowerCase().includes(needle),
    );
  }, [assets, assetQuery]);

  function currentBody(): IssueBody {
    return {
      employeeId: fEmployeeId,
      assetIds: [...fAssetIds],
      ...(fNote.trim() ? { note: fNote.trim() } : {}),
    };
  }
  const dialogBody = pendingRef.current?.body ?? currentBody();
  const formHint = !fEmployeeId
    ? 'Odaberite zaposlenog'
    : fAssetIds.length === 0
      ? 'Odaberite barem jedno sredstvo'
      : null;

  function toggleAsset(id: string, on: boolean) {
    setFAssetIds((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  const reversUrl = selected?.groupToken
    ? `${origin()}/q/z/${encodeURIComponent(selected.groupToken)}`
    : null;
  const reversQr = useQrDataUri(reversUrl);

  async function printRevers(c: CustodyDetail, url: string | null, qrUri: string | null) {
    setError(null);
    try {
      await print(
        { custodyId: c.id },
        'REVERS',
        <ReversPrint custody={c} url={url} qrUri={qrUri} />,
      );
    } catch (e: unknown) {
      setError(`Štampa nije evidentirana, pa nije pokrenuta: ${eamErrorText(e)}`);
    }
  }

  const columns: Array<Column<CustodySummary>> = [
    {
      key: 'number',
      header: 'Broj ZD',
      render: (c) => <span className="mono">{c.custodyNumber}</span>,
      text: (c) => c.custodyNumber,
    },
    {
      key: 'employee',
      header: 'Zaposleni',
      render: (c) => c.employeeName ?? '—',
      text: (c) => c.employeeName ?? '',
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <span className={`badge ${CUSTODY_STATUS[c.status][1]}`}>
          {CUSTODY_STATUS[c.status][0]}
        </span>
      ),
      text: (c) => CUSTODY_STATUS[c.status][0],
    },
    {
      key: 'items',
      header: 'Stavki',
      align: 'right',
      render: (c) => <span className="mono">{c.items}</span>,
    },
    {
      key: 'open',
      header: 'Otvoreno',
      align: 'right',
      render: (c) => <span className="mono">{c.open}</span>,
    },
    {
      key: 'date',
      header: 'Datum',
      render: (c) => <span className="mono">{isoDay(c.issuedAt)}</span>,
      text: (c) => isoDay(c.issuedAt),
    },
  ];

  return (
    <>
      {error ? <ErrorState text={error} /> : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}

      <div className="grid-2">
        <div className="card">
          <h2>Zaduženja (revers)</h2>
          <div className="row" style={{ marginBottom: 8 }}>
            <select
              className="select"
              style={{ maxWidth: 200 }}
              aria-label="Filter statusa zaduženja"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | CustodyStatus)}
            >
              <option value="">Svi statusi</option>
              <option value="OPEN">Zaduženo</option>
              <option value="PARTIALLY_RETURNED">Djelimično vraćeno</option>
              <option value="CLOSED">Razduženo</option>
            </select>
            <select
              className="select"
              style={{ maxWidth: 240 }}
              aria-label="Filter zaposlenog"
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
            >
              <option value="">Svi zaposleni</option>
              {employeeFilterOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {listError ? <ErrorState text={listError} /> : null}
          {custodies === null ? (
            <LoadingState text="Učitavanje zaduženja…" />
          ) : (
            <DataTable
              columns={columns}
              rows={custodies}
              rowKey={(c) => c.id}
              onRowClick={(c) => openCustody(c.id)}
              searchPlaceholder="Pretraga zaduženja…"
              emptyText={
                statusFilter || employeeFilter
                  ? 'Nema zaduženja za odabrane filtere.'
                  : 'Još nema zaduženja opreme.'
              }
            />
          )}

          {canManage ? (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ marginBottom: 6 }}>Novo zaduženje</h3>
              {hasPending ? (
                <div className="alert alert-warn">
                  Prethodno slanje nije potvrđeno. Ponovite slanje — šalje se isti sadržaj pod istim
                  ključem, bez duplikata.
                </div>
              ) : null}
              <label className="label" htmlFor="cu-employee">
                Zaposleni (aktivni)
              </label>
              {employeesError ? (
                <ErrorState text={`Lista zaposlenih nije dostupna: ${employeesError}`} />
              ) : null}
              <select
                id="cu-employee"
                className="select"
                value={fEmployeeId}
                disabled={hasPending || employees === null}
                onChange={(e) => setFEmployeeId(e.target.value)}
              >
                <option value="">
                  {employees === null ? 'Učitavanje zaposlenih…' : 'Odaberite zaposlenog'}
                </option>
                {activeEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employeeNumber} — {e.name}
                  </option>
                ))}
              </select>

              <label className="label" htmlFor="cu-asset-q">
                Sredstva ({fAssetIds.length} odabrano)
              </label>
              <input
                id="cu-asset-q"
                className="input"
                placeholder="Pretraga sredstava po broju ili nazivu…"
                value={assetQuery}
                disabled={hasPending}
                onChange={(e) => setAssetQuery(e.target.value)}
              />
              {assets === null ? (
                <LoadingState text="Učitavanje sredstava…" />
              ) : assetOptions.length === 0 ? (
                <EmptyState
                  text={
                    assets.length ? 'Ništa ne odgovara pretrazi.' : 'Nema sredstava u registru.'
                  }
                />
              ) : (
                <div
                  role="group"
                  aria-label="Sredstva za zaduženje"
                  style={{
                    maxHeight: 220,
                    overflowY: 'auto',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--sp-2)',
                    marginTop: 'var(--sp-2)',
                  }}
                >
                  {assetOptions.map((a) => {
                    const retired = a.status === 'RETIRED';
                    return (
                      <label
                        key={a.id}
                        className="row"
                        style={{
                          gap: 8,
                          flexWrap: 'nowrap',
                          padding: '4px 2px',
                          cursor: retired || hasPending ? 'not-allowed' : 'pointer',
                        }}
                        title={retired ? 'Rashodovano sredstvo se ne može zadužiti' : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={fAssetIds.includes(a.id)}
                          disabled={retired || hasPending}
                          onChange={(e) => toggleAsset(a.id, e.target.checked)}
                        />
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                          <span className="mono">{a.assetNumber}</span> — {a.name}
                          {retired ? (
                            <span className="muted" style={{ fontSize: 12 }}>
                              {' '}
                              (rashodovano)
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                Sredstvo koje je već zaduženo server odbija i navodi broj sredstva i reversa.
              </p>

              <label className="label" htmlFor="cu-note">
                Napomena (opcionalno)
              </label>
              <input
                id="cu-note"
                className="input"
                maxLength={500}
                value={fNote}
                disabled={hasPending}
                onChange={(e) => setFNote(e.target.value)}
              />
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy || (!hasPending && formHint !== null)}
                  onClick={() => setConfirmNew(true)}
                >
                  {hasPending ? 'Ponovi slanje' : 'Pregledaj i zaduži'}
                </button>
                {!hasPending && formHint ? (
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {formHint}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="card">
          <h2>Detalj zaduženja</h2>
          {detailError ? <ErrorState text={detailError} /> : null}
          {!selected ? (
            detailError ? null : (
              <EmptyState text="Odaberite zaduženje iz liste." />
            )
          ) : (
            <>
              <Fact label="Broj ZD">
                <span className="mono">{selected.custodyNumber}</span>
              </Fact>
              <Fact label="Zaposleni">
                {selected.employeeName ?? '—'}
                {selected.employeeNumber ? (
                  <span className="mono muted"> ({selected.employeeNumber})</span>
                ) : null}
              </Fact>
              <Fact label="Status">
                <span className={`badge ${CUSTODY_STATUS[selected.status][1]}`}>
                  {CUSTODY_STATUS[selected.status][0]}
                </span>
              </Fact>
              <Fact label="Datum">
                <span className="mono">{isoDay(selected.issuedAt)}</span>
              </Fact>
              {selected.note ? <Fact label="Napomena">{selected.note}</Fact> : null}

              <h3 style={{ marginTop: 16, marginBottom: 6 }}>Stavke</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Broj</th>
                    <th>Naziv</th>
                    <th>Stanje</th>
                    {canManage ? <th style={{ textAlign: 'right' }}>Radnja</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((l) => (
                    <tr key={l.assetId}>
                      <td>
                        <span className="mono">{l.assetNumber}</span>
                      </td>
                      <td>{l.assetName}</td>
                      <td>
                        {l.returnedAt ? (
                          <>
                            <span
                              className={`badge ${CONDITION_LABEL[l.returnCondition ?? 'OK'][1]}`}
                            >
                              {CONDITION_LABEL[l.returnCondition ?? 'OK'][0]}
                            </span>{' '}
                            <span className="mono muted" style={{ fontSize: 12 }}>
                              {isoDay(l.returnedAt)}
                            </span>
                            {l.returnNote ? (
                              <div className="muted" style={{ fontSize: 12 }}>
                                {l.returnNote}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="badge badge-info">Zaduženo</span>
                        )}
                      </td>
                      {canManage ? (
                        <td style={{ textAlign: 'right' }}>
                          {l.returnedAt ? null : (
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={busy}
                              onClick={() => {
                                setReturnFor(l);
                                setRCondition('OK');
                                setRNote('');
                                setRError(null);
                              }}
                            >
                              Razduži
                            </button>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 style={{ marginTop: 16, marginBottom: 6 }}>Revers</h3>
              <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
                Revers se štampa s QR kodom (kad je izdat). QR kod na reversu vodi na javnu provjeru
                stavki (bez imena zaposlenog).
              </p>
              {reversUrl ? (
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  {reversQr.uri ? (
                    <img
                      src={reversQr.uri}
                      width={120}
                      height={120}
                      alt={`QR kod reversa ${selected.custodyNumber}`}
                    />
                  ) : null}
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="mono muted"
                      style={{ fontSize: 11, wordBreak: 'break-all', marginBottom: 8 }}
                    >
                      {reversUrl}
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={printing || (!reversQr.uri && !reversQr.failed)}
                      title={
                        !reversQr.uri && !reversQr.failed ? 'QR kod se još generiše' : undefined
                      }
                      onClick={() => void printRevers(selected, reversUrl, reversQr.uri)}
                    >
                      Štampaj revers
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="alert alert-warn">
                    QR reversa je opozvan — stari odštampani revers više ne otvara javnu provjeru.
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={printing}
                    onClick={() => void printRevers(selected, null, null)}
                  >
                    Štampaj revers (bez QR)
                  </button>
                </>
              )}
              {canManage ? (
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() => setQrAction('rotate')}
                  >
                    {selected.groupToken ? 'Zamijeni QR' : 'Izdaj novi QR'}
                  </button>
                  {selected.groupToken ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={busy}
                      onClick={() => setQrAction('revoke')}
                    >
                      Opozovi QR
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {qrAction && selected ? (
        <ConfirmDialog
          open
          title={qrAction === 'revoke' ? 'Opoziv QR reversa' : 'Novi QR reversa'}
          consequence={
            qrAction === 'revoke'
              ? 'QR reversa se opoziva — VEĆ ODŠTAMPANI REVERSI prestaju otvarati javnu provjeru (auditirano).'
              : selected.groupToken
                ? 'Izdaje se novi QR token — VEĆ ODŠTAMPANI REVERSI prestaju raditi; odštampajte revers ponovo (auditirano).'
                : 'Izdaje se novi QR token za revers; odštampajte revers ponovo (auditirano).'
          }
          confirmLabel={qrAction === 'revoke' ? 'Opozovi' : 'Izdaj novi QR'}
          danger={qrAction === 'revoke'}
          busy={busy}
          onCancel={() => setQrAction(null)}
          onConfirm={() => {
            const action = qrAction;
            const custodyId = selected.id;
            void run(
              async () => {
                const r = await api<CustodyDetail>(
                  'POST',
                  `/api/v1/equipment/custody/${custodyId}/qr`,
                  action === 'revoke' ? { revoke: true } : {},
                );
                setQrAction(null);
                setSelected(r);
              },
              action === 'revoke' ? 'QR reversa je opozvan.' : 'Izdat je novi QR reversa.',
            );
          }}
        >
          <Fact label="Revers">
            <span className="mono">{selected.custodyNumber}</span>
          </Fact>
          <Fact label="Zaposleni">{selected.employeeName ?? '—'}</Fact>
        </ConfirmDialog>
      ) : null}

      {confirmNew ? (
        <ConfirmDialog
          open
          title={hasPending ? 'Ponovno slanje zaduženja' : 'Novo zaduženje'}
          consequence={
            hasPending
              ? 'Prethodno slanje nije potvrđeno — šalje se RANIJE PREDANI sadržaj pod istim ključem (bez duplikata).'
              : 'Sredstva se zadužuju zaposlenom jednim reversom (auditirano); već zadužena ili rashodovana sredstva server odbija.'
          }
          confirmLabel="Zaduži"
          busy={busy}
          onCancel={() => setConfirmNew(false)}
          onConfirm={() =>
            void run(async () => {
              if (!pendingRef.current) {
                pendingRef.current = { key: crypto.randomUUID(), body: currentBody() };
                setHasPending(true);
              }
              const pending = pendingRef.current;
              let r: CustodyDetail;
              try {
                r = await api<CustodyDetail>('POST', '/api/v1/equipment/custody', {
                  ...pending.body,
                  requestKey: pending.key,
                });
              } catch (e) {
                // Discard key+content only on a business-unambiguous
                // rejection; CONFLICT, 401/403, 5xx and network errors keep
                // them for a safe retry under the same key.
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
              setFAssetIds([]);
              setFNote('');
              setSelected(r);
              setDetailError(null);
              setNotice(
                `Zaduženje ${r.custodyNumber} je evidentirano za ${r.employeeName ?? 'zaposlenog'}.`,
              );
            }, null)
          }
        >
          <Fact label="Zaposleni">{employeeLabel(dialogBody.employeeId)}</Fact>
          <Fact label="Broj sredstava">
            <span className="mono">{dialogBody.assetIds.length}</span>
          </Fact>
          <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 13 }}>
            {dialogBody.assetIds.map((id) => (
              <li key={id}>{assetLabel(id)}</li>
            ))}
          </ul>
          <Fact label="Napomena">{dialogBody.note ?? '—'}</Fact>
        </ConfirmDialog>
      ) : null}

      {returnFor && selected ? (
        <ConfirmDialog
          open
          title="Razduženje stavke"
          consequence={
            rCondition === 'OK'
              ? 'Stavka se razdužuje kao ispravna (auditirano); status reversa se ažurira.'
              : 'Stavka se razdužuje kao oštećena/izgubljena uz obavezno obrazloženje (auditirano).'
          }
          confirmLabel="Razduži"
          danger={rCondition !== 'OK'}
          busy={busy}
          onCancel={() => setReturnFor(null)}
          onConfirm={() => {
            if (rCondition !== 'OK' && !rNote.trim()) {
              setRError('Za oštećeno ili izgubljeno sredstvo napomena je obavezna.');
              return;
            }
            const custodyId = selected.id;
            void run(async () => {
              await api('POST', `/api/v1/equipment/custody/${custodyId}/return`, {
                items: [
                  {
                    assetId: returnFor.assetId,
                    condition: rCondition,
                    ...(rNote.trim() ? { note: rNote.trim() } : {}),
                  },
                ],
              });
              setReturnFor(null);
              openCustody(custodyId);
            }, `Stavka ${returnFor.assetNumber} je razdužena.`);
          }}
        >
          <Fact label="Revers">
            <span className="mono">{selected.custodyNumber}</span>
          </Fact>
          <Fact label="Sredstvo">
            {returnFor.assetNumber} — {returnFor.assetName}
          </Fact>
          <label className="label" htmlFor="ret-cond">
            Stanje pri vraćanju
          </label>
          <select
            id="ret-cond"
            className="select"
            value={rCondition}
            onChange={(e) => {
              setRCondition(e.target.value as ReturnCondition);
              setRError(null);
            }}
          >
            {CONDITION_OPTIONS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <label className="label" htmlFor="ret-note">
            Napomena{rCondition === 'OK' ? ' (opcionalno)' : ' (obavezno)'}
          </label>
          <input
            id="ret-note"
            className="input"
            maxLength={500}
            value={rNote}
            onChange={(e) => {
              setRNote(e.target.value);
              setRError(null);
            }}
          />
          {rError ? <ErrorState text={rError} /> : null}
        </ConfirmDialog>
      ) : null}

      {portal}
    </>
  );
}

/** Print-only revers document (mounted only while printing). */
function ReversPrint({
  custody,
  url,
  qrUri,
}: {
  custody: CustodyDetail;
  url: string | null;
  qrUri: string | null;
}) {
  const sign = (label: string) => (
    <div style={{ flex: 1 }}>
      <div style={{ height: 48, borderBottom: '1px solid var(--color-text)' }} />
      <div style={{ fontSize: 12, marginTop: 4 }}>{label}</div>
    </div>
  );
  return (
    <div style={{ padding: 24 }}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: '0 0 4px' }}>Revers — zaduženje opreme</h1>
          <Fact label="Broj">
            <span className="mono">{custody.custodyNumber}</span>
          </Fact>
          <Fact label="Datum">
            <span className="mono">{isoDay(custody.issuedAt)}</span>
          </Fact>
          <Fact label="Zaposleni">
            {custody.employeeName ?? '—'}
            {custody.employeeNumber ? (
              <span className="mono"> ({custody.employeeNumber})</span>
            ) : null}
          </Fact>
          {custody.note ? <Fact label="Napomena">{custody.note}</Fact> : null}
        </div>
        {qrUri ? <img src={qrUri} width={110} height={110} alt="QR kod reversa" /> : null}
      </div>

      <table className="table" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>R. br.</th>
            <th>Broj sredstva</th>
            <th>Naziv</th>
            <th>Vraćeno</th>
          </tr>
        </thead>
        <tbody>
          {custody.lines.map((l, i) => (
            <tr key={l.assetId}>
              <td className="mono">{i + 1}</td>
              <td className="mono">{l.assetNumber}</td>
              <td>{l.assetName}</td>
              <td>
                {l.returnedAt
                  ? `${isoDay(l.returnedAt)} — ${CONDITION_LABEL[l.returnCondition ?? 'OK'][0]}`
                  : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontSize: 12, marginTop: 16 }}>
        Svojim potpisom zaposleni potvrđuje prijem navedene opreme i obavezu njenog vraćanja u
        ispravnom stanju.
      </p>
      <div style={{ display: 'flex', gap: 48, marginTop: 32 }}>
        {sign('Zadužio')}
        {sign('Primio')}
      </div>
      {url ? (
        <div className="mono" style={{ fontSize: 10, marginTop: 24, wordBreak: 'break-all' }}>
          Provjera: {url}
        </div>
      ) : null}
    </div>
  );
}

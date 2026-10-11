'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiRequestError, errorText } from '../../../lib/api';
import { submissionResolvedByError } from '../../../lib/idempotency';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import {
  SerialInput,
  serialProblem,
  serialsApplicable,
  serialsPayload,
  useSerialPolicies,
  type SerialPolicyState,
} from '../../../components/serial-input';
import { useApp } from '../app-shell';

/**
 * Sprint 242 (QMS-005): quarantine holds with material-review
 * dispositions. Presentation and input hints only — the server enforces
 * quantities, the deviation note, the regrade target and posts the stock
 * movements; every rejection is shown with the server's explanation.
 */

type HoldStatus = 'ACTIVE' | 'RELEASED' | 'SCRAPPED' | 'DISPOSED';

export interface QuarantineHold {
  id: string;
  warehouseId: string;
  skuId: string;
  skuCode: string;
  quantity: string;
  remainingQuantity: string;
  lotNumber: string | null;
  ncrId: string | null;
  parentHoldId: string | null;
  reason: string;
  status: HoldStatus;
  createdAt: string;
}

type DispositionType = 'USE_AS_IS' | 'SCRAP' | 'RETURN_TO_SUPPLIER' | 'REGRADE' | 'REWORK';

interface DispositionLineView {
  lineNo: number;
  type: DispositionType;
  quantity: string;
  targetSkuId: string | null;
  targetQuantity: string | null;
  supplierRef: string | null;
  reworkHoldId: string | null;
  movementId: string | null;
  targetMovementId: string | null;
}

interface DispositionView {
  id: string;
  holdId: string;
  status: 'POSTING' | 'POSTED' | 'FAILED';
  note: string | null;
  lastError: string | null;
  lines: DispositionLineView[];
  duplicate?: boolean;
  createdAt?: string;
}

interface NcrOption {
  id: string;
  ncrNumber: string;
  skuId: string;
}

interface WarehouseOption {
  id: string;
  code: string;
}

interface SkuOption {
  id: string;
  code: string;
  status: string;
}

const HOLD_STATUS_LABELS: Record<HoldStatus, string> = {
  ACTIVE: 'Blokirano',
  RELEASED: 'Pušteno',
  SCRAPPED: 'Otpisano',
  DISPOSED: 'Riješeno',
};

const HOLD_STATUS_BADGE: Record<HoldStatus, string> = {
  ACTIVE: 'badge-warn',
  RELEASED: 'badge-ok',
  SCRAPPED: 'badge-danger',
  DISPOSED: 'badge-info',
};

const DISPOSITION_TYPES: DispositionType[] = [
  'USE_AS_IS',
  'SCRAP',
  'RETURN_TO_SUPPLIER',
  'REGRADE',
  'REWORK',
];

const DISPOSITION_LABELS: Record<DispositionType, string> = {
  USE_AS_IS: 'Upotreba kakva jeste (odstupanje)',
  SCRAP: 'Otpis',
  RETURN_TO_SUPPLIER: 'Povrat dobavljaču',
  REGRADE: 'Prekvalifikacija u drugi artikal',
  REWORK: 'Dorada',
};

const DISPOSITION_STATUS_LABELS: Record<DispositionView['status'], string> = {
  POSTING: 'Knjiženje u toku',
  POSTED: 'Proknjiženo',
  FAILED: 'Knjiženje nije uspjelo',
};

const DISPOSITION_STATUS_BADGE: Record<DispositionView['status'], string> = {
  POSTING: 'badge-info',
  POSTED: 'badge-ok',
  FAILED: 'badge-danger',
};

const MIN_DEVIATION_NOTE = 10;

/** Rounds away binary float noise before display / comparison. */
function tidy(n: number): number {
  return Math.round(n * 1e9) / 1e9;
}

function newRequestKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `qmr-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function formatDate(value: string | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('bs-BA');
}

interface DraftLine {
  key: string;
  type: DispositionType;
  quantity: string;
  targetSkuId: string;
  targetQuantity: string;
  supplierRef: string;
  serials: string[];
}

function emptyLine(type: DispositionType = 'SCRAP', quantity = ''): DraftLine {
  return {
    key: `l-${Math.random().toString(36).slice(2, 10)}`,
    type,
    quantity,
    targetSkuId: '',
    targetQuantity: '',
    supplierRef: '',
    serials: [],
  };
}

/** Why the draft cannot be submitted yet (hints; the server decides). */
function draftProblems(
  hold: QuarantineHold,
  lines: readonly DraftLine[],
  note: string,
  policy: SerialPolicyState,
): string[] {
  const problems: string[] = [];
  if (lines.length === 0) problems.push('Dodajte barem jednu stavku odluke.');
  lines.forEach((l, i) => {
    const n = i + 1;
    const qty = Number(l.quantity);
    if (l.quantity.trim() === '' || !Number.isFinite(qty) || qty <= 0) {
      problems.push(`Stavka ${n}: unesite količinu veću od nule.`);
    }
    if (l.type === 'REGRADE') {
      if (!l.targetSkuId) problems.push(`Stavka ${n}: odaberite ciljni artikal.`);
      else if (l.targetSkuId === hold.skuId) {
        problems.push(`Stavka ${n}: ciljni artikal mora biti različit od zadržanog.`);
      }
      const tq = Number(l.targetQuantity);
      if (l.targetQuantity.trim() === '' || !Number.isFinite(tq) || tq <= 0) {
        problems.push(`Stavka ${n}: unesite ciljnu količinu veću od nule.`);
      }
    }
    if (l.type === 'RETURN_TO_SUPPLIER' && l.supplierRef.trim() === '') {
      problems.push(`Stavka ${n}: unesite referencu dobavljača (npr. broj reklamacije).`);
    }
    const sp = serialProblem(policy, qty, l.serials);
    if (sp) problems.push(`Stavka ${n}: ${sp}`);
  });
  if (lines.some((l) => l.type === 'USE_AS_IS') && note.trim().length < MIN_DEVIATION_NOTE) {
    problems.push(
      `Upotreba kakva jeste zahtijeva obrazloženje odstupanja/koncesije od najmanje ${MIN_DEVIATION_NOTE} znakova.`,
    );
  }
  const sum = tidy(lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0));
  const remaining = Number(hold.remainingQuantity);
  if (Number.isFinite(remaining) && sum > remaining) {
    problems.push(`Zbir stavki (${sum}) premašuje preostalu blokiranu količinu (${remaining}).`);
  }
  return problems;
}

function DispositionLines({
  lines,
  skuLabel,
}: {
  lines: DispositionLineView[];
  skuLabel: (id: string) => string;
}) {
  return (
    <table className="table" style={{ marginTop: 6 }}>
      <thead>
        <tr>
          <th>#</th>
          <th>Odluka</th>
          <th style={{ textAlign: 'right' }}>Količina</th>
          <th>Detalji</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.lineNo}>
            <td className="mono">{l.lineNo}</td>
            <td>{DISPOSITION_LABELS[l.type] ?? l.type}</td>
            <td className="mono" style={{ textAlign: 'right' }}>
              {l.quantity}
            </td>
            <td style={{ fontSize: 12.5 }}>
              {l.type === 'REGRADE' && l.targetSkuId ? (
                <div>
                  Ciljni artikal: <span className="mono">{skuLabel(l.targetSkuId)}</span>
                  {l.targetQuantity ? ` × ${l.targetQuantity}` : ''}
                </div>
              ) : null}
              {l.supplierRef ? (
                <div>
                  Referenca dobavljača: <span className="mono">{l.supplierRef}</span>
                </div>
              ) : null}
              {l.reworkHoldId ? (
                <div>
                  Novo zadržavanje za doradu:{' '}
                  <span className="mono">{l.reworkHoldId.slice(0, 8)}</span> (čeka ponovnu kontrolu
                  i odluku)
                </div>
              ) : null}
              {l.movementId ? (
                <div className="muted">
                  Kretanje: <span className="mono">{l.movementId.slice(0, 8)}</span>
                  {l.targetMovementId ? (
                    <>
                      {' '}
                      / ciljno: <span className="mono">{l.targetMovementId.slice(0, 8)}</span>
                    </>
                  ) : null}
                </div>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DispositionDialog({
  hold,
  skus,
  skuLabel,
  onClose,
  onChanged,
}: {
  hold: QuarantineHold;
  skus: SkuOption[];
  skuLabel: (id: string) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  // One idempotency key per open dialog: a double submit or a resend
  // after a lost response resolves to the same disposition server-side.
  const [requestKey, setRequestKey] = useState(newRequestKey);
  const [lines, setLines] = useState<DraftLine[]>(() => [
    emptyLine('SCRAP', hold.remainingQuantity),
  ]);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DispositionView | null>(null);
  const policyOf = useSerialPolicies([hold.skuId]);
  const policy = policyOf(hold.skuId);

  const locked = result !== null;
  const remaining = Number(hold.remainingQuantity);
  const sum = tidy(lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0));
  const rest = Number.isFinite(remaining) ? tidy(remaining - sum) : NaN;
  const problems = draftProblems(hold, lines, note, policy);
  const regradeTargets = skus.filter((s) => s.status === 'ACTIVE' && s.id !== hold.skuId);

  function patch(key: string, change: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...change } : l)));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<DispositionView>('POST', `/api/v1/quarantine/${hold.id}/dispositions`, {
        requestKey,
        ...(note.trim() ? { note: note.trim() } : {}),
        lines: lines.map((l) => ({
          type: l.type,
          quantity: Number(l.quantity),
          ...(l.type === 'REGRADE'
            ? { targetSkuId: l.targetSkuId, targetQuantity: Number(l.targetQuantity) }
            : {}),
          ...(l.type === 'RETURN_TO_SUPPLIER' ? { supplierRef: l.supplierRef.trim() } : {}),
          ...serialsPayload(policy, l.serials),
        })),
      });
      setResult(r);
      setConfirming(false);
      onChanged();
    } catch (e: unknown) {
      setError(errorText(e));
      setConfirming(false);
      // A definitive validation rejection created nothing under the key;
      // the corrected decision may start a fresh intent. Anything else
      // (conflict, network, 5xx) keeps the key for a safe resend.
      if (e instanceof ApiRequestError && submissionResolvedByError(e.status, e.body.code)) {
        setRequestKey(newRequestKey());
      }
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<DispositionView>(
        'POST',
        `/api/v1/quarantine/dispositions/${result.id}/retry`,
      );
      setResult(r);
      onChanged();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="dialog-scrim"
        role="presentation"
        onClick={busy ? undefined : onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy && !confirming) onClose();
        }}
      >
        <div
          className="dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Odluka komisije"
          style={{ width: 'min(720px, 100%)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2>Odluka komisije</h2>
          <div className="dialog-body">
            <div className="fact">
              <span>Artikal</span>
              <span className="mono">{hold.skuCode}</span>
            </div>
            {hold.lotNumber ? (
              <div className="fact">
                <span>Lot</span>
                <span className="mono">{hold.lotNumber}</span>
              </div>
            ) : null}
            <div className="fact">
              <span>Preostalo blokirano / ukupno zadržano</span>
              <span className="mono">
                {hold.remainingQuantity} / {hold.quantity}
              </span>
            </div>
            <div className="fact">
              <span>Razlog zadržavanja</span>
              <span>{hold.reason}</span>
            </div>

            {error ? <ErrorState text={error} /> : null}

            {result ? (
              <div style={{ marginTop: 12 }}>
                <div className="spread">
                  <strong>Rezultat</strong>
                  <span className={`badge ${DISPOSITION_STATUS_BADGE[result.status]}`}>
                    {DISPOSITION_STATUS_LABELS[result.status]}
                  </span>
                </div>
                {result.duplicate ? (
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    Ova odluka je već bila zaprimljena — prikazan je postojeći zapis, ništa nije
                    knjiženo dvaput.
                  </p>
                ) : null}
                {result.status === 'POSTED' ? (
                  <div className="alert alert-ok">
                    Odluka je proknjižena. Neodlučena količina ostaje blokirana; stavke dorade
                    stvaraju novo zadržavanje koje treba ponovo odlučiti nakon ponovne kontrole.
                  </div>
                ) : null}
                {result.status === 'POSTING' ? (
                  <div className="alert alert-warn">
                    Knjiženje je u toku. Osvježite historiju odluka za konačni status.
                  </div>
                ) : null}
                {result.status === 'FAILED' ? (
                  <div className="alert alert-error" role="alert">
                    <strong>Knjiženje nije uspjelo:</strong> {result.lastError ?? 'nepoznat razlog'}
                    <div style={{ marginTop: 6 }}>
                      Odluka je zabilježena; ponovite knjiženje kada se uzrok otkloni.
                    </div>
                  </div>
                ) : null}
                <DispositionLines lines={result.lines} skuLabel={skuLabel} />
              </div>
            ) : (
              <>
                <h3 style={{ margin: '14px 0 6px', fontSize: 14 }}>Stavke odluke</h3>
                {lines.map((l, i) => {
                  const id = `${hold.id}-${l.key}`;
                  return (
                    <fieldset
                      key={l.key}
                      style={{
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 12px 10px',
                        marginBottom: 8,
                      }}
                    >
                      <legend style={{ fontSize: 12.5, fontWeight: 650 }}>Stavka {i + 1}</legend>
                      <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ flex: '2 1 220px' }}>
                          <label className="label" htmlFor={`${id}-type`}>
                            Odluka
                          </label>
                          <select
                            id={`${id}-type`}
                            className="select"
                            value={l.type}
                            disabled={busy || locked}
                            onChange={(e) =>
                              patch(l.key, { type: e.target.value as DispositionType })
                            }
                          >
                            {DISPOSITION_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {DISPOSITION_LABELS[t]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div style={{ flex: '1 1 110px' }}>
                          <label className="label" htmlFor={`${id}-qty`}>
                            Količina
                          </label>
                          <input
                            id={`${id}-qty`}
                            className="input"
                            type="number"
                            min="0.000001"
                            step="any"
                            inputMode="decimal"
                            value={l.quantity}
                            disabled={busy || locked}
                            onChange={(e) => patch(l.key, { quantity: e.target.value })}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={busy || locked || lines.length <= 1}
                          aria-label={`Ukloni stavku ${i + 1}`}
                          title={
                            lines.length <= 1 ? 'Odluka mora imati barem jednu stavku' : undefined
                          }
                          onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                        >
                          Ukloni
                        </button>
                      </div>
                      {l.type === 'REGRADE' ? (
                        <div className="row" style={{ flexWrap: 'wrap' }}>
                          <div style={{ flex: '2 1 220px' }}>
                            <label className="label" htmlFor={`${id}-target`}>
                              Ciljni artikal
                            </label>
                            <select
                              id={`${id}-target`}
                              className="select"
                              value={l.targetSkuId}
                              disabled={busy || locked}
                              onChange={(e) => patch(l.key, { targetSkuId: e.target.value })}
                            >
                              <option value="">Odaberite aktivan artikal…</option>
                              {regradeTargets.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.code}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div style={{ flex: '1 1 110px' }}>
                            <label className="label" htmlFor={`${id}-tqty`}>
                              Ciljna količina
                            </label>
                            <input
                              id={`${id}-tqty`}
                              className="input"
                              type="number"
                              min="0.000001"
                              step="any"
                              inputMode="decimal"
                              value={l.targetQuantity}
                              disabled={busy || locked}
                              onChange={(e) => patch(l.key, { targetQuantity: e.target.value })}
                            />
                          </div>
                        </div>
                      ) : null}
                      {l.type === 'RETURN_TO_SUPPLIER' ? (
                        <div>
                          <label className="label" htmlFor={`${id}-supplier`}>
                            Referenca dobavljača
                          </label>
                          <input
                            id={`${id}-supplier`}
                            className="input"
                            placeholder="npr. broj reklamacije ili RMA"
                            value={l.supplierRef}
                            disabled={busy || locked}
                            onChange={(e) => patch(l.key, { supplierRef: e.target.value })}
                          />
                        </div>
                      ) : null}
                      {l.type === 'REWORK' ? (
                        <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                          Dorada stvara novo blokirano zadržavanje; nakon ponovne kontrole za njega
                          se donosi nova odluka.
                        </p>
                      ) : null}
                      {serialsApplicable(policy) ? (
                        <SerialInput
                          value={l.serials}
                          onChange={(next) => patch(l.key, { serials: next })}
                          policy={policy}
                          quantity={Number(l.quantity)}
                          disabled={busy || locked}
                          hint="Serijski brojevi zadržanih jedinica obuhvaćenih ovom stavkom."
                        />
                      ) : null}
                    </fieldset>
                  );
                })}
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy || locked}
                  onClick={() =>
                    setLines((prev) => [
                      ...prev,
                      emptyLine('SCRAP', Number.isFinite(rest) && rest > 0 ? String(rest) : ''),
                    ])
                  }
                >
                  + Dodaj stavku
                </button>

                <label className="label" htmlFor={`${hold.id}-note`}>
                  Napomena komisije
                  {lines.some((l) => l.type === 'USE_AS_IS')
                    ? ` (obavezno obrazloženje odstupanja, min. ${MIN_DEVIATION_NOTE} znakova)`
                    : ' (opcionalno)'}
                </label>
                <textarea
                  id={`${hold.id}-note`}
                  className="input"
                  rows={3}
                  value={note}
                  disabled={busy || locked}
                  onChange={(e) => setNote(e.target.value)}
                />

                <div className="fact" aria-live="polite" style={{ marginTop: 10, fontWeight: 600 }}>
                  <span>Zbir stavki / preostalo blokirano</span>
                  <span className="mono">
                    {sum} / {hold.remainingQuantity}
                    {Number.isFinite(rest) && rest > 0 ? ` (ostaje blokirano ${rest})` : ''}
                  </span>
                </div>

                {problems.length > 0 ? (
                  <div className="alert alert-warn" style={{ marginTop: 10 }} aria-live="polite">
                    <strong>Odluka još nije spremna za knjiženje:</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Zatvori
            </button>
            {result?.status === 'FAILED' ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void retry()}
              >
                {busy ? 'Izvršavam…' : 'Ponovi knjiženje'}
              </button>
            ) : null}
            {!result ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || problems.length > 0}
                title={
                  problems.length > 0 ? 'Knjiženje je blokirano — vidi razloge iznad' : undefined
                }
                onClick={() => setConfirming(true)}
              >
                Proknjiži odluku
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Potvrda odluke komisije"
        consequence="Odluka se knjiži kao kretanja zaliha (otpis, povrat, prekvalifikacija, puštanje ili dorada) i evidentira u reviziji."
        confirmLabel="Potvrdi i proknjiži"
        busy={busy}
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
      >
        <div className="fact">
          <span>Artikal</span>
          <span className="mono">{hold.skuCode}</span>
        </div>
        {lines.map((l, i) => (
          <div className="fact" key={l.key}>
            <span>
              {i + 1}. {DISPOSITION_LABELS[l.type]}
              {l.type === 'REGRADE' && l.targetSkuId
                ? ` → ${skuLabel(l.targetSkuId)} × ${l.targetQuantity}`
                : ''}
              {l.type === 'RETURN_TO_SUPPLIER' ? ` (${l.supplierRef.trim()})` : ''}
            </span>
            <span className="mono">{l.quantity}</span>
          </div>
        ))}
        <div className="fact">
          <span>Ostaje blokirano</span>
          <span className="mono">{Number.isFinite(rest) ? rest : '—'}</span>
        </div>
      </ConfirmDialog>
    </>
  );
}

function DispositionHistory({
  hold,
  skuLabel,
  canRetry,
  reloadToken,
  onChanged,
}: {
  hold: QuarantineHold;
  skuLabel: (id: string) => string;
  canRetry: boolean;
  reloadToken: number;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<DispositionView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    api<{ dispositions: DispositionView[] }>('GET', `/api/v1/quarantine/${hold.id}/dispositions`)
      .then((r) => setItems(r.dispositions))
      .catch((e: unknown) => {
        setItems([]);
        setLoadError(errorText(e));
      });
  }, [hold.id]);

  useEffect(load, [load, reloadToken]);

  async function retry(d: DispositionView) {
    setBusyId(d.id);
    setError(null);
    try {
      await api('POST', `/api/v1/quarantine/dispositions/${d.id}/retry`);
      load();
      onChanged();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ padding: '6px 0 4px' }}>
      {loadError ? <ErrorState text={loadError} /> : null}
      {error ? <ErrorState text={error} /> : null}
      {items === null ? <LoadingState text="Učitavanje historije odluka…" /> : null}
      {items !== null && items.length === 0 && !loadError ? (
        <EmptyState text="Za ovo zadržavanje još nema odluka komisije." />
      ) : null}
      {(items ?? []).map((d) => (
        <div
          key={d.id}
          style={{ borderTop: '1px dashed var(--color-border)', padding: '8px 0' }}
          aria-label={`Odluka ${d.id.slice(0, 8)}`}
        >
          <div className="spread">
            <span>
              <span className={`badge ${DISPOSITION_STATUS_BADGE[d.status]}`}>
                {DISPOSITION_STATUS_LABELS[d.status]}
              </span>{' '}
              <span className="muted" style={{ fontSize: 12 }}>
                {formatDate(d.createdAt)}
              </span>
            </span>
            {d.status === 'FAILED' && canRetry ? (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busyId !== null}
                onClick={() => void retry(d)}
              >
                {busyId === d.id ? 'Izvršavam…' : 'Ponovi knjiženje'}
              </button>
            ) : null}
          </div>
          {d.note ? (
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>
              <span className="muted">Napomena:</span> {d.note}
            </p>
          ) : null}
          {d.status === 'FAILED' && d.lastError ? (
            <p className="alert alert-error" role="alert" style={{ margin: '6px 0 0' }}>
              {d.lastError}
            </p>
          ) : null}
          <DispositionLines lines={d.lines} skuLabel={skuLabel} />
        </div>
      ))}
    </div>
  );
}

export function QuarantinePanel({
  warehouses,
  skus,
  onStockChanged,
}: {
  warehouses: WarehouseOption[];
  skus: SkuOption[];
  onStockChanged: () => void;
}) {
  const { can } = useApp();
  const [holds, setHolds] = useState<QuarantineHold[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ncrs, setNcrs] = useState<NcrOption[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [deciding, setDeciding] = useState<QuarantineHold | null>(null);
  const [historyToken, setHistoryToken] = useState(0);

  const [holdSku, setHoldSku] = useState('');
  const [holdWarehouse, setHoldWarehouse] = useState('');
  const [holdQty, setHoldQty] = useState('1');
  const [holdReason, setHoldReason] = useState('');
  const [holdLot, setHoldLot] = useState('');
  const [holdNcr, setHoldNcr] = useState('');

  const canQcRead = can('qc.read');

  const load = useCallback(() => {
    setLoadError(null);
    api<{ holds: QuarantineHold[] }>('GET', '/api/v1/quarantine')
      .then((r) => setHolds(r.holds))
      .catch((e: unknown) => {
        setHolds((prev) => prev ?? []);
        setLoadError(errorText(e));
      });
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (!canQcRead) return;
    api<{ ncrs: NcrOption[] }>('GET', '/api/v1/qc/ncrs')
      .then((r) => setNcrs(r.ncrs))
      .catch(() => setNcrs([]));
  }, [canQcRead]);

  const skuLabel = (id: string) => skus.find((s) => s.id === id)?.code ?? id.slice(0, 8);
  const warehouseLabel = (id: string) =>
    warehouses.find((w) => w.id === id)?.code ?? id.slice(0, 8);
  const ncrLabel = (id: string) => ncrs.find((n) => n.id === id)?.ncrNumber ?? id.slice(0, 8);
  const ncrOptions = holdSku ? ncrs.filter((n) => n.skuId === holdSku) : ncrs;

  function changed() {
    load();
    setHistoryToken((t) => t + 1);
    onStockChanged();
  }

  async function run(fn: () => Promise<unknown>, successText: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(successText);
      changed();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="spread">
        <h2>Karantin</h2>
        <button className="btn btn-sm" type="button" onClick={load}>
          Osvježi
        </button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Blokirane količine ne mogu se rezervisati ni izdati dok komisija za neusaglašeni materijal
        ne odluči o njima. Djelimična odluka je dozvoljena — neodlučeni ostatak ostaje blokiran.
      </p>
      {notice ? <div className="alert alert-ok">{notice}</div> : null}
      {error ? <ErrorState text={error} /> : null}
      {loadError ? <ErrorState text={loadError} /> : null}
      {holds === null && !loadError ? <LoadingState text="Učitavanje zadržavanja…" /> : null}
      {holds !== null && holds.length === 0 && !loadError ? (
        <EmptyState text="Nema karantinskih zadržavanja." />
      ) : null}
      {holds !== null && holds.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>Artikal</th>
              <th>Skladište</th>
              <th>Lot</th>
              <th style={{ textAlign: 'right' }}>Preostalo / ukupno</th>
              <th>NCR</th>
              <th>Razlog</th>
              <th>Status</th>
              <th aria-label="Radnje" />
            </tr>
          </thead>
          <tbody>
            {holds.map((h) => {
              const open = expanded.has(h.id);
              const historyId = `qh-history-${h.id}`;
              return (
                <Fragment key={h.id}>
                  <tr>
                    <td>
                      <strong className="mono">{h.skuCode}</strong>
                      {h.parentHoldId ? (
                        <>
                          {' '}
                          <span
                            className="badge badge-accent"
                            title={`Nastalo doradom iz zadržavanja ${h.parentHoldId.slice(0, 8)} — čeka ponovnu kontrolu i odluku`}
                          >
                            Dorada
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td className="mono">{warehouseLabel(h.warehouseId)}</td>
                    <td className="mono">{h.lotNumber ?? '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {h.remainingQuantity} / {h.quantity}
                    </td>
                    <td>
                      {h.ncrId ? (
                        canQcRead ? (
                          <Link href="/quality" className="mono" title="Otvori modul kvaliteta">
                            {ncrLabel(h.ncrId)}
                          </Link>
                        ) : (
                          <span className="mono">{h.ncrId.slice(0, 8)}</span>
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{h.reason}</td>
                    <td>
                      <span className={`badge ${HOLD_STATUS_BADGE[h.status] ?? ''}`}>
                        {HOLD_STATUS_LABELS[h.status] ?? h.status}
                      </span>
                    </td>
                    <td>
                      <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-expanded={open}
                          aria-controls={historyId}
                          onClick={() => toggle(h.id)}
                        >
                          {open ? 'Sakrij historiju' : 'Historija odluka'}
                        </button>
                        {h.status === 'ACTIVE' && can('qc.approve') ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={busy}
                              onClick={() => setDeciding(h)}
                            >
                              Odluka komisije
                            </button>
                            <button
                              className="btn btn-sm"
                              disabled={busy}
                              type="button"
                              title="Brza odluka: pušta cijelu preostalu količinu"
                              onClick={() =>
                                void run(
                                  () =>
                                    api('POST', `/api/v1/quarantine/${h.id}/decide`, {
                                      decision: 'RELEASE',
                                    }),
                                  'Zadržavanje pušteno.',
                                )
                              }
                            >
                              Pusti
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              disabled={busy}
                              type="button"
                              title="Brza odluka: otpisuje cijelu preostalu količinu"
                              onClick={() =>
                                void run(
                                  () =>
                                    api('POST', `/api/v1/quarantine/${h.id}/decide`, {
                                      decision: 'SCRAP',
                                    }),
                                  'Zadržavanje otpisano — zalihe korigovane.',
                                )
                              }
                            >
                              Otpiši
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {open ? (
                    <tr id={historyId}>
                      <td colSpan={8}>
                        <DispositionHistory
                          hold={h}
                          skuLabel={skuLabel}
                          canRetry={can('qc.approve')}
                          reloadToken={historyToken}
                          onChanged={changed}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      ) : null}

      {can('inventory.adjust') ? (
        <form
          style={{ marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('POST', '/api/v1/quarantine', {
                warehouseId: holdWarehouse,
                skuId: holdSku,
                quantity: Number(holdQty),
                reason: holdReason,
                ...(holdLot.trim() ? { lotNumber: holdLot.trim() } : {}),
                ...(holdNcr ? { ncrId: holdNcr } : {}),
              });
              setHoldReason('');
              setHoldLot('');
              setHoldNcr('');
            }, 'Karantinsko zadržavanje postavljeno.');
          }}
        >
          <h3 style={{ margin: '6px 0', fontSize: 14 }}>Novo zadržavanje</h3>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <select
              className="select"
              style={{ maxWidth: 150 }}
              aria-label="Skladište"
              value={holdWarehouse}
              onChange={(e) => setHoldWarehouse(e.target.value)}
              required
            >
              <option value="">Skladište…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code}
                </option>
              ))}
            </select>
            <select
              className="select"
              style={{ maxWidth: 150 }}
              aria-label="Artikal (SKU)"
              value={holdSku}
              onChange={(e) => {
                const next = e.target.value;
                setHoldSku(next);
                if (holdNcr && !ncrs.some((n) => n.id === holdNcr && n.skuId === next)) {
                  setHoldNcr('');
                }
              }}
              required
            >
              <option value="">SKU…</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code}
                </option>
              ))}
            </select>
            <input
              className="input"
              style={{ maxWidth: 90 }}
              type="number"
              min="0.000001"
              step="any"
              inputMode="decimal"
              aria-label="Količina"
              value={holdQty}
              onChange={(e) => setHoldQty(e.target.value)}
              required
            />
            <input
              className="input"
              style={{ maxWidth: 140 }}
              placeholder="Lot (opcionalno)"
              aria-label="Lot (opcionalno)"
              value={holdLot}
              onChange={(e) => setHoldLot(e.target.value)}
            />
            {canQcRead ? (
              <select
                className="select"
                style={{ maxWidth: 170 }}
                aria-label="Povezani NCR (opcionalno)"
                value={holdNcr}
                onChange={(e) => setHoldNcr(e.target.value)}
              >
                <option value="">
                  {ncrOptions.length === 0 ? 'Nema NCR za artikal' : 'NCR (opcionalno)…'}
                </option>
                {ncrOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.ncrNumber}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              className="input"
              style={{ maxWidth: 200 }}
              placeholder="Razlog"
              aria-label="Razlog"
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              required
            />
            <button className="btn btn-sm btn-primary" disabled={busy} type="submit">
              Postavi zadržavanje
            </button>
          </div>
        </form>
      ) : null}

      {deciding ? (
        <DispositionDialog
          hold={deciding}
          skus={skus}
          skuLabel={skuLabel}
          onClose={() => setDeciding(null)}
          onChanged={changed}
        />
      ) : null}
    </div>
  );
}

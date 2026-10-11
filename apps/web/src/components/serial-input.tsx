'use client';

import { useEffect, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { api } from '../lib/api';

/**
 * Sprint 239 (WMS-018): scan-first serial number entry for stock flows.
 *
 * Pure input/presentation: the server enforces the SKU serial policy
 * (whole units, one serial per unit, in-stock checks). The helpers here
 * only mirror the count rule so an obviously incomplete scan is explained
 * BEFORE submit instead of after a round trip.
 */

export type SerialPolicy = 'NONE' | 'OPTIONAL' | 'REQUIRED';
/** UNKNOWN: the policy could not be read (e.g. no `product.read`). */
export type SerialPolicyState = SerialPolicy | 'UNKNOWN' | 'LOADING';

/** Same shape the API accepts; anything else is rejected client-side. */
const SERIAL_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/;
const MAX_SERIALS = 1000;

/**
 * Loads the serial policy for each SKU via GET /api/v1/skus/:id/serials.
 * Returns a lookup; ids not loaded yet read as LOADING.
 */
export function useSerialPolicies(skuIds: readonly string[]): (skuId: string) => SerialPolicyState {
  const key = [...new Set(skuIds.filter(Boolean))].sort().join(',');
  const [policies, setPolicies] = useState<Record<string, SerialPolicyState>>({});

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const ids = key.split(',');
    void Promise.all(
      ids.map((id) =>
        api<{ policy: SerialPolicy }>('GET', `/api/v1/skus/${id}/serials`)
          .then((r) => [id, r.policy] as const)
          .catch(() => [id, 'UNKNOWN' as const] as const),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      setPolicies((prev) => {
        const next = { ...prev };
        for (const [id, policy] of pairs) next[id] = policy;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return (skuId: string) => policies[skuId] ?? 'LOADING';
}

/** Whether the serial input is shown for this policy. */
export function serialsApplicable(policy: SerialPolicyState): boolean {
  return policy === 'OPTIONAL' || policy === 'REQUIRED' || policy === 'UNKNOWN';
}

/**
 * Why the entered serials block submission (null = OK). Mirrors the
 * server rule: when serials are given (always for REQUIRED) the quantity
 * must be whole units and exactly one serial per unit.
 */
export function serialProblem(
  policy: SerialPolicyState,
  quantity: number,
  serials: readonly string[],
): string | null {
  if (!serialsApplicable(policy)) return null;
  const n = serials.length;
  if (policy !== 'REQUIRED' && n === 0) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isInteger(quantity)) {
    return 'Serijski praćen artikal: količina mora biti cijeli broj komada.';
  }
  if (n !== quantity) {
    return policy === 'REQUIRED'
      ? `Artikal zahtijeva serijske brojeve: potrebno ${quantity}, uneseno ${n}.`
      : `Ako unosite serijske brojeve, potreban je tačno jedan po komadu: ${quantity}, uneseno ${n}.`;
  }
  return null;
}

/** Serials to send: never for NONE, omitted when empty. */
export function serialsPayload(
  policy: SerialPolicyState,
  serials: readonly string[],
): { serials?: string[] } {
  return serialsApplicable(policy) && serials.length > 0 ? { serials: [...serials] } : {};
}

interface SerialInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  policy: SerialPolicyState;
  /** Expected number of units (the line/movement quantity). */
  quantity: number;
  disabled?: boolean;
  label?: string;
  /** Short context line, e.g. "Serijski broj mora biti na zalihi u izvornom skladištu." */
  hint?: string;
}

/**
 * Text input where Enter (a barcode scanner's terminator) adds the value
 * to a chip list. Pasting many lines / comma-separated values adds all of
 * them. Duplicates and malformed values are rejected with a message.
 */
export function SerialInput({
  value,
  onChange,
  policy,
  quantity,
  disabled,
  label = 'Serijski brojevi',
  hint,
}: SerialInputProps) {
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const limit =
    Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, MAX_SERIALS) : MAX_SERIALS;

  function add(raw: string) {
    const tokens = raw
      .split(/[\n\r,;\t]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length === 0) return;
    const next = [...value];
    const seen = new Set(next);
    const duplicates: string[] = [];
    const invalid: string[] = [];
    let overLimit = 0;
    for (const token of tokens) {
      if (!SERIAL_RE.test(token)) invalid.push(token);
      else if (seen.has(token)) duplicates.push(token);
      else if (next.length >= limit) overLimit += 1;
      else {
        next.push(token);
        seen.add(token);
      }
    }
    const added = next.length - value.length;
    if (added > 0) onChange(next);
    const parts: string[] = [];
    if (duplicates.length) {
      parts.push(
        duplicates.length === 1
          ? `Serijski broj ${duplicates[0]} je već unesen.`
          : `Odbijeno duplikata: ${duplicates.length} (${duplicates.slice(0, 3).join(', ')}${duplicates.length > 3 ? '…' : ''}).`,
      );
    }
    if (invalid.length) {
      parts.push(
        `Neispravan format: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''} (dozvoljena slova, brojevi i . _ / -).`,
      );
    }
    if (overLimit) {
      parts.push(`Već je uneseno ${limit} od ${limit} — višak (${overLimit}) nije dodan.`);
    }
    if (tokens.length > 1 && added > 0) parts.unshift(`Dodano ${added}.`);
    setMessage(parts.length ? parts.join(' ') : null);
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      // Never submit the surrounding form on a scan.
      e.preventDefault();
      add(draft);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    if (/[\n\r,;\t]/.test(text)) {
      e.preventDefault();
      add(`${draft}${text}`);
    }
  }

  const required = policy === 'REQUIRED';
  const countKnown = Number.isInteger(quantity) && quantity > 0;
  const complete = countKnown && value.length === quantity;
  const counterClass = complete ? 'badge-ok' : required || value.length > 0 ? 'badge-warn' : '';

  return (
    <div>
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <label className="label">
          {label}
          {required ? ' (obavezno — jedan po komadu)' : ' (opciono)'}
        </label>
        <span className={`badge ${counterClass}`} aria-live="polite">
          {value.length} / {countKnown ? quantity : '—'}
        </span>
      </div>
      {policy === 'UNKNOWN' ? (
        <div className="muted" style={{ fontSize: 12 }}>
          Politika serijskih brojeva za ovaj artikal nije dostupna — unesite ih ako ih artikal
          zahtijeva; server provjerava.
        </div>
      ) : null}
      {hint ? (
        <div className="muted" style={{ fontSize: 12 }}>
          {hint}
        </div>
      ) : null}
      <div className="row" style={{ flexWrap: 'nowrap', marginTop: 4 }}>
        <input
          className="input mono"
          style={{ minWidth: 0 }}
          placeholder="Skeniraj ili upiši pa Enter"
          value={draft}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="enter"
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        <button
          type="button"
          className="btn btn-sm"
          disabled={disabled || !draft.trim()}
          onClick={() => add(draft)}
        >
          Dodaj
        </button>
      </div>
      {message ? (
        <div className="muted" role="status" style={{ fontSize: 12, marginTop: 4 }}>
          {message}
        </div>
      ) : null}
      {value.length > 0 ? (
        <div className="row" style={{ marginTop: 6, gap: 6 }}>
          {value.map((sn) => (
            <span
              key={sn}
              className="badge mono"
              style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={sn}
            >
              {sn}
              <button
                type="button"
                className="btn btn-sm"
                style={{ padding: '0 6px' }}
                disabled={disabled}
                aria-label={`Ukloni ${sn}`}
                onClick={() => {
                  onChange(value.filter((v) => v !== sn));
                  setMessage(null);
                }}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="btn btn-sm"
            disabled={disabled}
            onClick={() => {
              onChange([]);
              setMessage(null);
            }}
          >
            Očisti sve
          </button>
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { api, ApiRequestError, errorText } from '../lib/api';
import { ConfirmDialog } from './ui';

/**
 * Made-to-measure (Sprint 247/248) presentation: the tenant's configured
 * measured products and surcharges, the "Stavka po mjeri" quote form and the
 * read-only line breakdown. The server computes every quantity and amount —
 * the UI only collects input and renders the returned `spec` (UX rule: no
 * business logic in components). Tokens only, no tenant brand.
 */

export type MeasureBasis = 'AREA' | 'LENGTH' | 'PIECE';
export type SurchargeType = 'PERCENT' | 'PER_PIECE' | 'PER_UNIT';

export interface MeasuredProductConfig {
  skuCode: string;
  basis: MeasureBasis;
  minBillable: number;
  maxWidthMm?: number | null;
  maxHeightMm?: number | null;
}

export interface SurchargeConfig {
  code: string;
  label: string;
  type: SurchargeType;
  value: number;
  installation?: boolean;
  skuCodes?: string[];
}

export interface MadeToMeasureConfig {
  products: MeasuredProductConfig[];
  surcharges: SurchargeConfig[];
  tierDiscounts: Record<string, number>;
  discountInstallation?: boolean;
}

export interface SpecAmount {
  code: string;
  label: string;
  type: SurchargeType;
  value: number;
  amount: number;
}

export interface MeasuredSpec {
  basis: MeasureBasis;
  widthMm: number;
  heightMm: number | null;
  pieces: number;
  measuredPerPiece: number;
  billablePerPiece: number;
  billableQuantity: number;
  unit: 'm2' | 'm1' | 'pcs';
  unitPrice: number;
  base: number;
  surcharges: SpecAmount[];
  installation: SpecAmount[];
  goodsGross: number;
  installationGross: number;
  discountPct: number;
  discountSource: 'EXPLICIT' | 'RULE' | 'TIER' | 'NONE';
  goodsNet: number;
  installationNet: number;
  total: number;
  note?: string | null;
}

export interface SkuOption {
  id: string;
  code: string;
  name?: string;
}

export const DISCOUNT_SOURCE_LABELS: Record<MeasuredSpec['discountSource'], string> = {
  TIER: 'Rabat kupca',
  RULE: 'Pravilo',
  EXPLICIT: 'Ručni',
  NONE: 'Bez popusta',
};

export const BASIS_LABELS: Record<MeasureBasis, string> = {
  AREA: 'po površini (m²)',
  LENGTH: 'po dužini (m1)',
  PIECE: 'po komadu',
};

const UNIT_LABELS: Record<MeasuredSpec['unit'], string> = {
  m2: 'm²',
  m1: 'm1',
  pcs: 'kom',
};

/** Display formatting only (the amounts come from the server). */
export function money(n: number | string): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return String(n);
  return v.toLocaleString('bs-BA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qty(n: number): string {
  return n.toLocaleString('bs-BA', { maximumFractionDigits: 3 });
}

function surchargeValue(s: { type: SurchargeType; value: number }, currency: string): string {
  if (s.type === 'PERCENT') return `${qty(s.value)}%`;
  if (s.type === 'PER_PIECE') return `${money(s.value)} ${currency}/kom`;
  return `${money(s.value)} ${currency}/jed.`;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Tolerant parse of `config.cpq.madeToMeasure`; invalid entries are skipped. */
export function parseMadeToMeasureConfig(raw: unknown): MadeToMeasureConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const products: MeasuredProductConfig[] = [];
  for (const entry of Array.isArray(r.products) ? r.products : []) {
    const p = (entry ?? {}) as Record<string, unknown>;
    if (typeof p.skuCode !== 'string') continue;
    if (p.basis !== 'AREA' && p.basis !== 'LENGTH' && p.basis !== 'PIECE') continue;
    products.push({
      skuCode: p.skuCode,
      basis: p.basis,
      minBillable: asNumber(p.minBillable) ?? 0,
      maxWidthMm: asNumber(p.maxWidthMm),
      maxHeightMm: asNumber(p.maxHeightMm),
    });
  }
  const surcharges: SurchargeConfig[] = [];
  for (const entry of Array.isArray(r.surcharges) ? r.surcharges : []) {
    const s = (entry ?? {}) as Record<string, unknown>;
    if (typeof s.code !== 'string') continue;
    if (s.type !== 'PERCENT' && s.type !== 'PER_PIECE' && s.type !== 'PER_UNIT') continue;
    surcharges.push({
      code: s.code,
      label: typeof s.label === 'string' && s.label ? s.label : s.code,
      type: s.type,
      value: asNumber(s.value) ?? 0,
      installation: s.installation === true,
      skuCodes: Array.isArray(s.skuCodes)
        ? s.skuCodes.filter((c): c is string => typeof c === 'string')
        : [],
    });
  }
  const tierDiscounts: Record<string, number> = {};
  const tiers = (r.tierDiscounts ?? {}) as Record<string, unknown>;
  if (tiers && typeof tiers === 'object') {
    for (const [tier, pct] of Object.entries(tiers)) {
      const n = asNumber(pct);
      if (n !== null) tierDiscounts[tier] = n;
    }
  }
  return {
    products,
    surcharges,
    tierDiscounts,
    discountInstallation: r.discountInstallation === true,
  };
}

export interface MadeToMeasureState {
  config: MadeToMeasureConfig | null;
  loading: boolean;
  /** Human-readable reason the configuration is unavailable. */
  error: string | null;
}

/** Reads the effective tenant configuration (configuration.read). */
export function useMadeToMeasureConfig(enabled = true): MadeToMeasureState {
  const [state, setState] = useState<MadeToMeasureState>({
    config: null,
    loading: enabled,
    error: null,
  });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api<{ config: { cpq?: { madeToMeasure?: unknown } } }>('GET', '/api/v1/tenant/configuration')
      .then((r) => {
        if (!alive) return;
        setState({
          config: parseMadeToMeasureConfig(r.config?.cpq?.madeToMeasure),
          loading: false,
          error: null,
        });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const forbidden = e instanceof ApiRequestError && e.status === 403;
        setState({
          config: null,
          loading: false,
          error: forbidden
            ? 'Pravila proizvoda po mjeri nisu vidljiva — potrebna je dozvola za čitanje konfiguracije.'
            : errorText(e),
        });
      });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return state;
}

/**
 * Resolves the configured SKU codes to catalog SKUs. Starts from the SKUs the
 * page already loaded and looks up any missing code through the catalog search.
 */
function useMeasuredSkus(codes: string[], known: SkuOption[]): Map<string, SkuOption> {
  const [found, setFound] = useState<SkuOption[]>([]);
  const key = codes.join('|');
  const knownKey = known.map((s) => s.code).join('|');
  useEffect(() => {
    const knownCodes = new Set(known.map((s) => s.code));
    const missing = codes.filter((c) => !knownCodes.has(c));
    if (missing.length === 0) return;
    let alive = true;
    void (async () => {
      const out: SkuOption[] = [];
      for (const code of missing) {
        try {
          const r = await api<{ products: Array<{ id: string }> }>(
            'GET',
            `/api/v1/products/search?q=${encodeURIComponent(code)}`,
          );
          const details = await Promise.all(
            r.products
              .slice(0, 5)
              .map((p) => api<{ skus: SkuOption[] }>('GET', `/api/v1/products/${p.id}`)),
          );
          const hit = details.flatMap((d) => d.skus).find((s) => s.code === code);
          if (hit) out.push(hit);
        } catch {
          // The code stays unresolved and is reported in the form.
        }
      }
      if (alive) setFound(out);
    })();
    return () => {
      alive = false;
    };
  }, [key, knownKey]);
  return useMemo(() => {
    const map = new Map<string, SkuOption>();
    for (const s of [...known, ...found]) {
      if (codes.includes(s.code) && !map.has(s.code)) map.set(s.code, s);
    }
    return map;
  }, [key, knownKey, found]);
}

/* ------------------------------------------------------------ styles */

const panel: CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  background: 'color-mix(in srgb, var(--color-bg) 55%, transparent)',
  padding: 'var(--sp-4)',
  marginTop: 'var(--sp-4)',
};

const fieldGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
  gap: '0 var(--sp-3)',
};

const groupTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: 'var(--color-muted-solid)',
  margin: 'var(--sp-4) 0 var(--sp-2)',
};

const optionLabel: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--sp-2)',
  minHeight: 40,
  padding: '6px 12px',
  border: '1px solid var(--color-border-strong)',
  borderRadius: 999,
  background: 'var(--color-surface)',
  cursor: 'pointer',
  fontSize: 13,
};

/* -------------------------------------------------------------- form */

interface MeasuredLineFormProps {
  quoteId: string;
  currency: string;
  skus: SkuOption[];
  mtm: MadeToMeasureState;
  disabled?: boolean;
  onAdded: () => void;
}

export function MeasuredLineForm({
  quoteId,
  currency,
  skus,
  mtm,
  disabled,
  onAdded,
}: MeasuredLineFormProps) {
  const products = mtm.config?.products ?? [];
  const codes = useMemo(() => products.map((p) => p.skuCode), [products]);
  const skuByCode = useMeasuredSkus(codes, skus);

  const [skuCode, setSkuCode] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [pieces, setPieces] = useState('1');
  const [chosen, setChosen] = useState<string[]>([]);
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const product = products.find((p) => p.skuCode === skuCode);
  const sku = skuCode ? skuByCode.get(skuCode) : undefined;
  const needsHeight = product?.basis === 'AREA';
  const applicable = (mtm.config?.surcharges ?? []).filter(
    (s) => !s.skuCodes || s.skuCodes.length === 0 || s.skuCodes.includes(skuCode),
  );
  const goods = applicable.filter((s) => !s.installation);
  const installation = applicable.filter((s) => s.installation);

  function toggle(code: string) {
    setChosen((c) => (c.includes(code) ? c.filter((x) => x !== code) : [...c, code]));
  }

  async function submit() {
    if (!sku || !product) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const allowed = new Set(applicable.map((s) => s.code));
      await api('POST', `/api/v1/quotes/${quoteId}/measured-lines`, {
        skuId: sku.id,
        widthMm: Number(width),
        ...(needsHeight ? { heightMm: Number(height) } : {}),
        pieces: Number(pieces),
        surchargeCodes: chosen.filter((c) => allowed.has(c)),
        ...(discount.trim() !== '' ? { discountPct: Number(discount) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setNotice('Stavka po mjeri dodana — iznose je izračunao server.');
      setWidth('');
      setHeight('');
      setPieces('1');
      setChosen([]);
      setDiscount('');
      setNote('');
      onAdded();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  let body: ReactNode;
  if (mtm.loading) {
    body = <div className="loading">Učitavanje pravila proizvoda po mjeri…</div>;
  } else if (mtm.error) {
    body = (
      <div className="alert alert-warn" role="status">
        {mtm.error}
      </div>
    );
  } else if (products.length === 0) {
    body = (
      <div className="empty">
        Nema konfigurisanih proizvoda po mjeri. Administrator ih dodaje u konfiguraciji (CPQ →
        proizvodi po mjeri).
      </div>
    );
  } else {
    const unresolved = codes.filter((c) => !skuByCode.has(c));
    body = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="label" htmlFor={`mtm-sku-${quoteId}`}>
          Proizvod
        </label>
        <select
          id={`mtm-sku-${quoteId}`}
          className="select"
          value={skuCode}
          onChange={(e) => {
            setSkuCode(e.target.value);
            setChosen([]);
            setError(null);
          }}
          required
        >
          <option value="">Odaberite proizvod po mjeri…</option>
          {products.map((p) => {
            const s = skuByCode.get(p.skuCode);
            return (
              <option key={p.skuCode} value={p.skuCode} disabled={!s}>
                {p.skuCode}
                {s?.name ? ` — ${s.name}` : ''} · {BASIS_LABELS[p.basis]}
                {s ? '' : ' (nije u katalogu)'}
              </option>
            );
          })}
        </select>
        {unresolved.length > 0 ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Nisu pronađeni u katalogu: {unresolved.join(', ')}
          </div>
        ) : null}
        {product ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            Obračun {BASIS_LABELS[product.basis]}
            {product.basis !== 'PIECE' && product.minBillable > 0
              ? ` · minimalno ${qty(product.minBillable)} ${product.basis === 'AREA' ? 'm²' : 'm1'} po komadu`
              : ''}
            {product.maxWidthMm ? ` · širina do ${product.maxWidthMm} mm` : ''}
            {product.maxHeightMm && product.basis === 'AREA'
              ? ` · visina do ${product.maxHeightMm} mm`
              : ''}
          </div>
        ) : null}

        <div style={fieldGrid}>
          <div>
            <label className="label" htmlFor={`mtm-w-${quoteId}`}>
              Širina (mm)
            </label>
            <input
              id={`mtm-w-${quoteId}`}
              className="input mono"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              max={product?.maxWidthMm ?? undefined}
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              required
            />
          </div>
          {needsHeight ? (
            <div>
              <label className="label" htmlFor={`mtm-h-${quoteId}`}>
                Visina (mm)
              </label>
              <input
                id={`mtm-h-${quoteId}`}
                className="input mono"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                max={product?.maxHeightMm ?? undefined}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                required
              />
            </div>
          ) : null}
          <div>
            <label className="label" htmlFor={`mtm-p-${quoteId}`}>
              Komada
            </label>
            <input
              id={`mtm-p-${quoteId}`}
              className="input mono"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={pieces}
              onChange={(e) => setPieces(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor={`mtm-d-${quoteId}`}>
              Ručni popust %
            </label>
            <input
              id={`mtm-d-${quoteId}`}
              className="input mono"
              type="number"
              min="0"
              max="100"
              step="any"
              placeholder="auto"
              title="Prazno = rabat kupca ili pravilo popusta"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
        </div>

        {skuCode && goods.length > 0 ? (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={groupTitle}>Dodaci</legend>
            <div className="row">
              {goods.map((s) => (
                <label key={s.code} style={optionLabel}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(s.code)}
                    onChange={() => toggle(s.code)}
                  />
                  {s.label}
                  <span className="muted mono" style={{ fontSize: 12 }}>
                    {surchargeValue(s, currency)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {skuCode && installation.length > 0 ? (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={groupTitle}>Montaža</legend>
            <div className="row">
              {installation.map((s) => (
                <label key={s.code} style={optionLabel}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(s.code)}
                    onChange={() => toggle(s.code)}
                  />
                  {s.label}
                  <span className="muted mono" style={{ fontSize: 12 }}>
                    {surchargeValue(s, currency)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <label className="label" htmlFor={`mtm-n-${quoteId}`}>
          Napomena (opcionalno)
        </label>
        <input
          id={`mtm-n-${quoteId}`}
          className="input"
          maxLength={300}
          placeholder="npr. kuhinja, lijevi pogon, boja platna"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {error ? (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="alert alert-ok" role="status">
            {notice}
          </div>
        ) : null}

        <div className="row" style={{ marginTop: 'var(--sp-4)', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={disabled || busy || !sku || !product}
          >
            {busy ? 'Računam…' : 'Dodaj stavku po mjeri'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <section style={panel} aria-label="Stavka po mjeri">
      <div className="spread">
        <strong>Stavka po mjeri</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          Cijenu, minimum i dodatke računa server
        </span>
      </div>
      {body}
    </section>
  );
}

/* ---------------------------------------------------- line breakdown */

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <span className="mono" style={{ textAlign: 'right' }}>
        {children}
      </span>
    </div>
  );
}

/** Compact dimensions text, e.g. "2400 × 1800 mm · 2 kom". */
export function specDimensions(spec: MeasuredSpec): string {
  const dims =
    spec.basis === 'AREA' && spec.heightMm !== null
      ? `${spec.widthMm} × ${spec.heightMm} mm`
      : `${spec.widthMm} mm`;
  return `${dims} · ${spec.pieces} kom`;
}

/** One-line spec summary for order lines and work orders. */
export function SpecSummary({ spec }: { spec: MeasuredSpec | null | undefined }) {
  if (!spec) return null;
  return (
    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
      <span className="badge badge-info" style={{ marginRight: 6 }}>
        po mjeri
      </span>
      <span className="mono">{specDimensions(spec)}</span>
      {spec.unit !== 'pcs' ? (
        <span className="mono">
          {' '}
          · {qty(spec.billableQuantity)} {UNIT_LABELS[spec.unit]}
        </span>
      ) : null}
      {spec.note ? <span> · {spec.note}</span> : null}
    </div>
  );
}

/** Rich, read-only breakdown of one made-to-measure quote line. */
export function MeasuredLineDetail({
  description,
  spec,
  currency,
}: {
  description: string;
  spec: MeasuredSpec;
  currency: string;
}) {
  const unit = UNIT_LABELS[spec.unit];
  const minimumApplied = spec.unit !== 'pcs' && spec.measuredPerPiece < spec.billablePerPiece;
  return (
    <div style={{ padding: 'var(--sp-2) 0' }}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <strong>{description}</strong>{' '}
          <span className="badge badge-info" style={{ marginLeft: 4 }}>
            po mjeri
          </span>
          <div className="mono" style={{ fontSize: 13, marginTop: 2 }}>
            {specDimensions(spec)}
          </div>
          {spec.note ? (
            <div className="muted" style={{ fontSize: 12.5 }}>
              {spec.note}
            </div>
          ) : null}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="muted" style={{ fontSize: 11.5 }}>
            Ukupno stavka
          </div>
          <strong className="mono" style={{ fontSize: 15 }}>
            {money(spec.total)} {currency}
          </strong>
        </div>
      </div>

      <div className="grid-2" style={{ gap: 'var(--sp-5)', marginTop: 'var(--sp-2)' }}>
        <div>
          {spec.unit !== 'pcs' ? (
            <Fact label={`Obračunska količina (${unit})`}>
              {qty(spec.billableQuantity)} {unit}
            </Fact>
          ) : (
            <Fact label="Količina">{spec.pieces} kom</Fact>
          )}
          {minimumApplied ? (
            <div className="muted" style={{ fontSize: 12, padding: '4px 0' }}>
              Primijenjen minimum: izmjereno {qty(spec.measuredPerPiece)} {unit}, obračunato{' '}
              {qty(spec.billablePerPiece)} {unit} po komadu.
            </div>
          ) : null}
          <Fact label="Jedinična cijena">
            {money(spec.unitPrice)} {currency}/{unit}
          </Fact>
          <Fact label="Osnovica">
            {money(spec.base)} {currency}
          </Fact>
          {spec.surcharges.map((s) => (
            <Fact key={s.code} label={`${s.label} (${surchargeValue(s, currency)})`}>
              + {money(s.amount)} {currency}
            </Fact>
          ))}
          <Fact label="Roba ukupno">
            {money(spec.goodsGross)} {currency}
          </Fact>
        </div>
        <div>
          {spec.installation.length > 0 ? (
            <>
              <div style={groupTitle}>Montaža</div>
              {spec.installation.map((s) => (
                <Fact key={s.code} label={`${s.label} (${surchargeValue(s, currency)})`}>
                  {money(s.amount)} {currency}
                </Fact>
              ))}
              <Fact label="Montaža ukupno">
                {money(spec.installationGross)} {currency}
              </Fact>
            </>
          ) : (
            <div className="muted" style={{ fontSize: 12.5, padding: '5px 0' }}>
              Bez montaže
            </div>
          )}
          <div className="fact">
            <span>Popust</span>
            <span>
              {spec.discountPct > 0 ? (
                <>
                  <span className="badge badge-warn" style={{ marginRight: 6 }}>
                    {DISCOUNT_SOURCE_LABELS[spec.discountSource]}
                  </span>
                  <span className="mono">−{qty(spec.discountPct)}%</span>
                </>
              ) : (
                <span className="muted">—</span>
              )}
            </span>
          </div>
          <Fact label="Roba neto">
            {money(spec.goodsNet)} {currency}
          </Fact>
          {spec.installation.length > 0 ? (
            <Fact label="Montaža neto">
              {money(spec.installationNet)} {currency}
            </Fact>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------- customer price tier */

interface PriceTierSelectProps {
  accountId: string;
  accountLabel: string;
}

/**
 * "Cjenovni nivo kupca" (crm.manage): picks one of the tenant's configured
 * tiers (config.cpq.madeToMeasure.tierDiscounts). The server stores it and
 * applies the tier discount to new made-to-measure quote lines.
 */
export function PriceTierSelect({ accountId, accountLabel }: PriceTierSelectProps) {
  const mtm = useMadeToMeasureConfig(true);
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setCurrent(undefined);
    setNotice(null);
    setError(null);
    api<{ priceTier?: string | null }>('GET', `/api/v1/crm/accounts/${accountId}`)
      .then((r) => {
        if (!alive) return;
        // Older API versions do not return the tier: keep it "unknown".
        if (r.priceTier !== undefined) {
          setCurrent(r.priceTier);
          setValue(r.priceTier ?? '');
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [accountId]);

  const tiers = Object.entries(mtm.config?.tierDiscounts ?? {});
  const label = (tier: string | null | undefined) => {
    if (tier === undefined) return 'nije učitan';
    if (tier === null) return 'bez nivoa';
    const pct = mtm.config?.tierDiscounts[tier];
    return pct !== undefined ? `${tier} (${qty(pct)}% rabata)` : tier;
  };

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api<{ priceTier: string | null }>(
        'POST',
        `/api/v1/crm/accounts/${accountId}/price-tier`,
        { priceTier: value === '' ? null : value },
      );
      setCurrent(r.priceTier);
      setNotice(`Cjenovni nivo sačuvan: ${label(r.priceTier)}.`);
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <section
      aria-label="Cjenovni nivo kupca"
      style={{ ...panel, background: 'var(--color-surface)' }}
    >
      <div className="spread">
        <strong>Cjenovni nivo kupca</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          Trenutno: {label(current)}
        </span>
      </div>
      {mtm.loading ? <div className="loading">Učitavanje nivoa…</div> : null}
      {mtm.error ? <div className="alert alert-warn">{mtm.error}</div> : null}
      {!mtm.loading && !mtm.error && tiers.length === 0 ? (
        <div className="empty">
          Nema konfigurisanih cjenovnih nivoa (CPQ → proizvodi po mjeri → rabati po nivou).
        </div>
      ) : null}
      {!mtm.loading && !mtm.error && tiers.length > 0 ? (
        <form
          className="row"
          style={{ marginTop: 'var(--sp-2)' }}
          onSubmit={(e) => {
            e.preventDefault();
            setConfirming(true);
          }}
        >
          <label htmlFor={`tier-${accountId}`} style={srOnly}>
            Cjenovni nivo
          </label>
          <select
            id={`tier-${accountId}`}
            className="select"
            style={{ maxWidth: 260 }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">Bez nivoa (bez rabata kupca)</option>
            {tiers.map(([tier, pct]) => (
              <option key={tier} value={tier}>
                {tier} — {qty(pct)}% rabata
              </option>
            ))}
          </select>
          <button
            className="btn btn-sm btn-primary"
            type="submit"
            disabled={busy || (current !== undefined && (current ?? '') === value)}
          >
            Sačuvaj nivo
          </button>
        </form>
      ) : null}
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Rabat nivoa važi za nove stavke po mjeri; postojeće ponude se ne mijenjaju.
      </div>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-ok" role="status">
          {notice}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Promjena cjenovnog nivoa"
        consequence="Novi nivo određuje rabat kupca na budućim stavkama po mjeri; promjena se evidentira u reviziji."
        confirmLabel="Sačuvaj nivo"
        busy={busy}
        onConfirm={() => void save()}
        onCancel={() => setConfirming(false)}
      >
        <div className="fact">
          <span>Kupac</span>
          <span>{accountLabel}</span>
        </div>
        <div className="fact">
          <span>Trenutno</span>
          <span>{label(current)}</span>
        </div>
        <div className="fact">
          <span>Novo</span>
          <span>{label(value === '' ? null : value)}</span>
        </div>
      </ConfirmDialog>
    </section>
  );
}

const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

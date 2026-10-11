'use client';

import Link from 'next/link';

/**
 * Sprint 248: made-to-measure spec snapshot carried by a work order that
 * was created from a sales order line. Presentation only — the values are
 * the OMS/CPQ snapshot; nothing is recalculated here.
 */
export interface WorkOrderSpec {
  basis?: 'AREA' | 'LENGTH' | 'PIECE' | string;
  widthMm?: number;
  heightMm?: number | null;
  pieces?: number;
  billableQuantity?: number;
  unit?: 'm2' | 'm1' | 'pcs' | string;
  surcharges?: Array<{ label?: string; code?: string }>;
  note?: string | null;
}

const UNIT_LABEL: Record<string, string> = { m2: 'm²', m1: 'm1', pcs: 'kom' };

const nf = new Intl.NumberFormat('bs-BA', { maximumFractionDigits: 2 });

/** A spec is shown only when it carries at least a width. */
export function hasSpec(spec: WorkOrderSpec | null | undefined): spec is WorkOrderSpec {
  return !!spec && typeof spec === 'object' && typeof spec.widthMm === 'number';
}

function dimensions(spec: WorkOrderSpec): string {
  return typeof spec.heightMm === 'number'
    ? `${nf.format(spec.widthMm ?? 0)} × ${nf.format(spec.heightMm)} mm`
    : `${nf.format(spec.widthMm ?? 0)} mm`;
}

/** Compact one-liner for the work order table. */
export function specSummary(spec: WorkOrderSpec): string {
  const pieces = typeof spec.pieces === 'number' ? ` · ${spec.pieces} kom` : '';
  return `${dimensions(spec)}${pieces}`;
}

export function MeasureBlock({
  spec,
  salesOrderId,
}: {
  spec: WorkOrderSpec;
  salesOrderId?: string | null | undefined;
}) {
  const unit = spec.unit ? (UNIT_LABEL[spec.unit] ?? spec.unit) : '';
  const surcharges = (spec.surcharges ?? [])
    .map((s) => s.label ?? s.code ?? '')
    .filter((s) => s.length > 0);
  return (
    <section
      aria-label="Mjere"
      style={{
        marginTop: 'var(--sp-3)',
        padding: 'var(--sp-3) var(--sp-4)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
        background: 'var(--color-accent-soft)',
      }}
    >
      <div className="spread">
        <strong>Mjere</strong>
        {salesOrderId ? (
          <Link href={`/orders?order=${encodeURIComponent(salesOrderId)}`} className="btn btn-sm">
            Narudžba ↗
          </Link>
        ) : null}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 750,
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
          margin: 'var(--sp-1) 0 var(--sp-2)',
        }}
      >
        {typeof spec.heightMm === 'number' ? (
          <>
            {nf.format(spec.widthMm ?? 0)} × {nf.format(spec.heightMm)}{' '}
            <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>
              mm (š × v)
            </span>
          </>
        ) : (
          <>
            {nf.format(spec.widthMm ?? 0)}{' '}
            <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>
              mm (širina)
            </span>
          </>
        )}
      </div>
      {typeof spec.pieces === 'number' ? (
        <div className="fact">
          <span>Komada</span>
          <strong>{spec.pieces}</strong>
        </div>
      ) : null}
      {typeof spec.billableQuantity === 'number' && spec.unit !== 'pcs' ? (
        <div className="fact">
          <span>Obračunska količina</span>
          <strong>
            {nf.format(spec.billableQuantity)} {unit}
          </strong>
        </div>
      ) : null}
      {surcharges.length > 0 ? (
        <div className="fact">
          <span>Doplate</span>
          <span style={{ textAlign: 'right' }}>{surcharges.join(', ')}</span>
        </div>
      ) : null}
      {spec.note ? (
        <p style={{ margin: 'var(--sp-2) 0 0', fontSize: 13.5 }}>
          <span className="muted">Napomena: </span>
          {spec.note}
        </p>
      ) : null}
    </section>
  );
}

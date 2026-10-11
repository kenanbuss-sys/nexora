import { describe, expect, it } from 'vitest';

import { computeMeasured, parseMadeToMeasure } from './measured';

const config = parseMadeToMeasure({
  products: [
    { skuCode: 'ROLO', basis: 'AREA', minBillable: 1.5, maxWidthMm: 3000 },
    { skuCode: 'LAJSNA', basis: 'LENGTH', minBillable: 1 },
    { skuCode: 'KOMARNIK', basis: 'PIECE' },
    { skuCode: 'bad', basis: 'VOLUME' },
  ],
  surcharges: [
    { code: 'RAL', label: 'RAL boja', type: 'PERCENT', value: 10 },
    { code: 'MOTOR', label: 'Motor', type: 'PER_PIECE', value: 120, skuCodes: ['ROLO'] },
    { code: 'MONT', label: 'Montaža', type: 'PER_UNIT', value: 8, installation: true },
    { code: 'MONTK', label: 'Montaža kom', type: 'PER_PIECE', value: 15, installation: true },
    { code: 'NEG', type: 'PER_PIECE', value: -1 },
  ],
  tierDiscounts: { A: 5, VELEPRODAJA: 25, X: 150 },
});

const rolo = config.products.get('ROLO')!;

describe('made-to-measure pricing (CPQ, Sprint 247)', () => {
  it('parses only valid rules', () => {
    expect([...config.products.keys()]).toEqual(['ROLO', 'LAJSNA', 'KOMARNIK']);
    expect(config.surcharges.has('NEG')).toBe(false);
    expect([...config.tierDiscounts.entries()]).toEqual([
      ['A', 5],
      ['VELEPRODAJA', 25],
    ]);
  });

  it('bills the minimum area per piece and rounds billable quantity up', () => {
    // 800 x 1200 = 0.96 m² < 1.5 min -> 1.5 per piece; 1234 x 1500 = 1.851 -> 1.86
    const small = computeMeasured(
      rolo,
      config,
      { widthMm: 800, heightMm: 1200, pieces: 2, surchargeCodes: [] },
      40,
      { pct: 0, source: 'NONE' },
    );
    expect(small).toMatchObject({
      billablePerPiece: 1.5,
      billableQuantity: 3,
      base: 120,
      total: 120,
    });
    const big = computeMeasured(
      rolo,
      config,
      { widthMm: 1234, heightMm: 1500, pieces: 1, surchargeCodes: [] },
      40,
      { pct: 0, source: 'NONE' },
    );
    expect(big).toMatchObject({ measuredPerPiece: 1.851, billablePerPiece: 1.86, base: 74.4 });
  });

  it('applies % and per-piece surcharges, installation per unit, discount on goods only', () => {
    const r = computeMeasured(
      rolo,
      config,
      { widthMm: 2000, heightMm: 1500, pieces: 2, surchargeCodes: ['RAL', 'MOTOR', 'MONT'] },
      40,
      { pct: 10, source: 'TIER' },
    );
    // base 6 m² x 40 = 240; RAL 24; motor 240; goods 504; install 6 x 8 = 48
    expect(r).toMatchObject({ base: 240, goodsGross: 504, installationGross: 48 });
    expect(r.goodsNet).toBe(453.6);
    expect(r.installationNet).toBe(48);
    expect(r.total).toBe(501.6);
  });

  it('length and piece bases', () => {
    const l = computeMeasured(
      config.products.get('LAJSNA')!,
      config,
      { widthMm: 700, pieces: 3, surchargeCodes: ['MONTK'] },
      10,
      { pct: 0, source: 'NONE' },
    );
    expect(l).toMatchObject({
      unit: 'm1',
      billablePerPiece: 1,
      billableQuantity: 3,
      base: 30,
      installationGross: 45,
    });
    const p = computeMeasured(
      config.products.get('KOMARNIK')!,
      config,
      { widthMm: 600, heightMm: 900, pieces: 4, surchargeCodes: [] },
      25,
      { pct: 0, source: 'NONE' },
    );
    expect(p).toMatchObject({ unit: 'pcs', billableQuantity: 4, total: 100 });
  });

  it('refuses invalid input', () => {
    const call =
      (
        input: Partial<{
          widthMm: number;
          heightMm: number;
          pieces: number;
          surchargeCodes: string[];
        }>,
        product = rolo,
      ) =>
      () =>
        computeMeasured(
          product,
          config,
          { widthMm: 1000, heightMm: 1000, pieces: 1, surchargeCodes: [], ...input },
          40,
          { pct: 0, source: 'NONE' },
        );
    expect(call({ widthMm: 3500 })).toThrow(/maximum/);
    expect(call({ heightMm: undefined as unknown as number })).toThrow(/Height/);
    expect(call({ pieces: 1.5 })).toThrow(/whole/);
    expect(call({ surchargeCodes: ['NOPE'] })).toThrow(/Unknown surcharge/);
    expect(call({ surchargeCodes: ['MOTOR'] }, config.products.get('KOMARNIK')!)).toThrow(
      /does not apply/,
    );
  });
});

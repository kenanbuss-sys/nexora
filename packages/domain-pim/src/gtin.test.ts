import { describe, expect, it } from 'vitest';

import { gtinCheckDigit, isValidGtin } from './gtin';

describe('GTIN (PIM-005)', () => {
  it('accepts GTIN-8/12/13/14 with a correct check digit', () => {
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('036000291452')).toBe(true);
    expect(isValidGtin('4006381333931')).toBe(true);
    expect(isValidGtin('14006381333938')).toBe(true);
  });

  it('refuses wrong check digit, length or non-digits', () => {
    expect(isValidGtin('4006381333932')).toBe(false);
    expect(isValidGtin('400638133393')).toBe(false);
    expect(isValidGtin('40063813339A1')).toBe(false);
    expect(isValidGtin('')).toBe(false);
  });

  it('computes the mod-10 check digit', () => {
    expect(gtinCheckDigit('400638133393')).toBe(1);
    expect(gtinCheckDigit('9638507')).toBe(4);
  });
});

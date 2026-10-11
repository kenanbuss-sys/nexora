/**
 * Client-side GTIN hint (GS1 mod-10). Display only: the server validates
 * every barcode and is authoritative — a hint never blocks submission.
 */
export const GTIN_LENGTHS: readonly number[] = [8, 12, 13, 14];

/** GS1 check digit for the data digits (weights 3,1,3… from the rightmost). */
export function gs1CheckDigit(dataDigits: string): number {
  let sum = 0;
  for (let i = 0; i < dataDigits.length; i++) {
    const digit = Number(dataDigits[dataDigits.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export interface GtinHint {
  ok: boolean;
  text: string;
}

/** Bosnian hint for a GTIN candidate; null for empty input. */
export function gtinHint(raw: string): GtinHint | null {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return { ok: false, text: 'GTIN smije sadržavati samo cifre.' };
  if (!GTIN_LENGTHS.includes(value.length)) {
    return {
      ok: false,
      text: `GTIN mora imati 8, 12, 13 ili 14 cifara (uneseno ${value.length}).`,
    };
  }
  const expected = gs1CheckDigit(value.slice(0, -1));
  if (Number(value[value.length - 1]) !== expected) {
    return {
      ok: false,
      text: `Kontrolna cifra ne odgovara GS1 pravilu — očekivana je ${expected}.`,
    };
  }
  return { ok: true, text: 'Kontrolna cifra je ispravna (GS1).' };
}

/**
 * GS1 GTIN validation (PIM-005). GTIN-8, GTIN-12 (UPC-A), GTIN-13 (EAN)
 * and GTIN-14 share one mod-10 check digit: weights 3,1,3,... from the
 * rightmost data digit.
 */
export const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

export function gtinCheckDigit(data: string): number {
  let sum = 0;
  for (let i = data.length - 1, w = 3; i >= 0; i -= 1, w = w === 3 ? 1 : 3) {
    sum += Number(data[i]) * w;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(value: string): boolean {
  if (!/^[0-9]+$/.test(value) || !GTIN_LENGTHS.has(value.length)) return false;
  return gtinCheckDigit(value.slice(0, -1)) === Number(value[value.length - 1]);
}

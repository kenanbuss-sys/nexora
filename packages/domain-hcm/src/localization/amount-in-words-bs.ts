/**
 * Bosnian amount in words for KM contracts (HCM-016, FinTrack parity of
 * "plata slovima"). Feminine forms for units, thousands and the currency
 * ("jedna/dvije marke", "jedna/dvije hiljade"); masculine for millions.
 * Output: "dvije hiljade sto KM i 50/100". Supports 0 … 999 999 999.99.
 */

const ONES_F = ['', 'jedna', 'dvije', 'tri', 'četiri', 'pet', 'šest', 'sedam', 'osam', 'devet'];
const ONES_M = ['', 'jedan', 'dva', 'tri', 'četiri', 'pet', 'šest', 'sedam', 'osam', 'devet'];
const TEENS = [
  'deset',
  'jedanaest',
  'dvanaest',
  'trinaest',
  'četrnaest',
  'petnaest',
  'šesnaest',
  'sedamnaest',
  'osamnaest',
  'devetnaest',
];
const TENS = [
  '',
  '',
  'dvadeset',
  'trideset',
  'četrdeset',
  'pedeset',
  'šezdeset',
  'sedamdeset',
  'osamdeset',
  'devedeset',
];
const HUNDREDS = [
  '',
  'sto',
  'dvjesto',
  'tristo',
  'četiristo',
  'petsto',
  'šeststo',
  'sedamsto',
  'osamsto',
  'devetsto',
];

function triple(n: number, feminine: boolean): string[] {
  const ones = feminine ? ONES_F : ONES_M;
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const words: string[] = [];
  if (h) words.push(HUNDREDS[h]!);
  if (rest >= 10 && rest < 20) words.push(TEENS[rest - 10]!);
  else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) words.push(TENS[t]!);
    if (o) words.push(ones[o]!);
  }
  return words;
}

/** Grammatical form by the last digits: 1 → one, 2-4 → few, else many. */
function form(n: number, one: string, few: string, many: string): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function integerInWordsBs(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 999_999_999) {
    throw new RangeError('Amount out of range for words');
  }
  if (value === 0) return 'nula';
  const millions = Math.floor(value / 1_000_000);
  const thousands = Math.floor((value % 1_000_000) / 1000);
  const rest = value % 1000;
  const words: string[] = [];
  if (millions) {
    words.push(...triple(millions, false), form(millions, 'milion', 'miliona', 'miliona'));
  }
  if (thousands) {
    words.push(...triple(thousands, true), form(thousands, 'hiljada', 'hiljade', 'hiljada'));
  }
  if (rest) words.push(...triple(rest, true));
  return words.join(' ');
}

export function amountInWordsBs(amount: number, currencyLabel = 'KM'): string {
  const cents = Math.round(amount * 100);
  if (cents < 0) throw new RangeError('Negative amounts are not written in words');
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${integerInWordsBs(whole)} ${currencyLabel} i ${fraction}/100`;
}

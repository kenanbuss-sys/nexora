import { describe, expect, it } from 'vitest';
import { amountInWordsBs, integerInWordsBs } from './amount-in-words-bs';

describe('amountInWordsBs (HCM-016)', () => {
  it.each([
    [0, 'nula'],
    [1, 'jedna'],
    [2, 'dvije'],
    [11, 'jedanaest'],
    [21, 'dvadeset jedna'],
    [100, 'sto'],
    [215, 'dvjesto petnaest'],
    [1000, 'jedna hiljada'],
    [2000, 'dvije hiljade'],
    [5000, 'pet hiljada'],
    [12000, 'dvanaest hiljada'],
    [22000, 'dvadeset dvije hiljade'],
    [2100, 'dvije hiljade sto'],
    [1_000_000, 'jedan milion'],
    [2_500_000, 'dva miliona petsto hiljada'],
    [
      999_999_999,
      'devetsto devedeset devet miliona devetsto devedeset devet hiljada devetsto devedeset devet',
    ],
  ])('%i → %s', (n, words) => {
    expect(integerInWordsBs(n)).toBe(words);
  });

  it('writes KM with hundredths', () => {
    expect(amountInWordsBs(2100.5)).toBe('dvije hiljade sto KM i 50/100');
    expect(amountInWordsBs(1)).toBe('jedna KM i 00/100');
  });

  it('refuses out-of-range values', () => {
    expect(() => integerInWordsBs(1_000_000_000)).toThrow(RangeError);
    expect(() => amountInWordsBs(-1)).toThrow(RangeError);
  });
});

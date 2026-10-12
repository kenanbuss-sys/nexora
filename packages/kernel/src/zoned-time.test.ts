import { describe, expect, it } from 'vitest';
import { isValidTimeZone, localDateOf, startOfLocalDay, zonedTimeToInstant } from './zoned-time';

const SA = 'Europe/Sarajevo';
const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe('zoned time', () => {
  it('validates IANA names', () => {
    expect(isValidTimeZone(SA)).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Base')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });

  it('local date of an instant crosses midnight in the zone, not in UTC', () => {
    // 23:30 UTC on 11.10. is already 01:30 on 12.10. in Sarajevo (CEST, +2)
    expect(localDateOf(new Date('2026-10-11T23:30:00Z'), SA).toISOString()).toBe(
      '2026-10-12T00:00:00.000Z',
    );
    // New York (-4) is still on 11.10.
    expect(localDateOf(new Date('2026-10-12T02:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-10-11T00:00:00.000Z',
    );
  });

  it('wall time to instant: summer, winter and both DST transitions', () => {
    expect(zonedTimeToInstant(day('2026-07-01'), 8, 0, SA).toISOString()).toBe(
      '2026-07-01T06:00:00.000Z',
    );
    expect(zonedTimeToInstant(day('2026-12-01'), 8, 0, SA).toISOString()).toBe(
      '2026-12-01T07:00:00.000Z',
    );
    // 29.03.2026: 02:00 → 03:00; 02:30 does not exist → resolves forward
    expect(zonedTimeToInstant(day('2026-03-29'), 2, 30, SA).toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    );
    expect(zonedTimeToInstant(day('2026-03-29'), 23, 59, SA).toISOString()).toBe(
      '2026-03-29T21:59:00.000Z',
    );
    // 25.10.2026: 03:00 → 02:00; 02:30 happens twice → first occurrence (CEST)
    expect(zonedTimeToInstant(day('2026-10-25'), 2, 30, SA).toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    );
    expect(zonedTimeToInstant(day('2026-10-25'), 23, 59, SA).toISOString()).toBe(
      '2026-10-25T22:59:00.000Z',
    );
  });

  it('start of local day', () => {
    expect(startOfLocalDay(new Date('2026-10-12T10:00:00Z'), SA).toISOString()).toBe(
      '2026-10-11T22:00:00.000Z',
    );
    expect(startOfLocalDay(new Date('2026-10-12T10:00:00Z'), 'UTC').toISOString()).toBe(
      '2026-10-12T00:00:00.000Z',
    );
  });
});

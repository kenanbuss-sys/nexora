/**
 * Calendar arithmetic in an IANA time zone without a dependency: the zone
 * offset of an instant is read from Intl, so DST transitions follow the
 * runtime's tz database. Calendar dates are represented as UTC-midnight
 * Date values ("2026-10-12" → 2026-10-12T00:00:00Z).
 */

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function parts(instant: Date, timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(instant).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** Offset (ms) of the zone at an instant: local wall clock minus UTC. */
function offsetAt(instant: Date, timeZone: string): number {
  const p = parts(instant, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The calendar date an instant falls on in the zone (UTC-midnight Date). */
export function localDateOf(instant: Date, timeZone: string): Date {
  const p = parts(instant, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/**
 * The instant at which the wall clock in the zone shows `date` hh:mm.
 * A wall time skipped by a DST jump resolves forward (02:30 → 03:30);
 * an ambiguous one (clock set back) resolves to the first occurrence.
 */
export function zonedTimeToInstant(
  date: Date,
  hours: number,
  minutes: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hours,
    minutes,
  );
  // Two passes converge for every real-world zone (offset changes ≤ once).
  const first = wall - offsetAt(new Date(wall), timeZone);
  const candidate = wall - offsetAt(new Date(first), timeZone);
  const earlier = wall - offsetAt(new Date(candidate - 3_600_000), timeZone);
  // Prefer the earlier of two valid readings (ambiguous fall-back hour).
  if (earlier < candidate && localWall(new Date(earlier), timeZone) === wall) {
    return new Date(earlier);
  }
  return new Date(candidate);
}

function localWall(instant: Date, timeZone: string): number {
  const p = parts(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
}

/** Start of the local day containing `instant`, as an instant. */
export function startOfLocalDay(instant: Date, timeZone: string): Date {
  return zonedTimeToInstant(localDateOf(instant, timeZone), 0, 0, timeZone);
}

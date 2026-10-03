// Selectable windows for the level trend chart. bucketSeconds is how wide a
// slice of readings gets averaged into one plotted point — chosen so every
// range lands at roughly 200-370 points per silo regardless of how long the
// window is, since the worker polls every ~10s and a year of raw readings
// would be millions of rows per silo.
export const TREND_RANGES = {
  "3h": { label: "3h", windowMs: 3 * 3600_000, bucketSeconds: 60, axis: "shortTime" },
  "12h": { label: "12h", windowMs: 12 * 3600_000, bucketSeconds: 180, axis: "shortTime" },
  "24h": { label: "24h", windowMs: 24 * 3600_000, bucketSeconds: 300, axis: "shortTime" },
  "7d": { label: "Week", windowMs: 7 * 86400_000, bucketSeconds: 1800, axis: "shortDate" },
  "30d": { label: "Month", windowMs: 30 * 86400_000, bucketSeconds: 7200, axis: "shortDate" },
  "1y": { label: "Year", windowMs: 365 * 86400_000, bucketSeconds: 86400, axis: "monthYear" },
} as const;

export type TrendRangeKey = keyof typeof TREND_RANGES;

export const DEFAULT_TREND_RANGE: TrendRangeKey = "3h";

// Anything unrecognised (a stale bookmark, a hand-edited URL) falls back to
// the default rather than erroring — and bucketSeconds only ever comes from
// the constant above, never from the URL, so it's safe to inline into SQL.
export function parseTrendRange(value: string | undefined): TrendRangeKey {
  return value && value in TREND_RANGES ? (value as TrendRangeKey) : DEFAULT_TREND_RANGE;
}

// --- Custom from/to date range -------------------------------------------
//
// The URL carries plain calendar dates (?from=2026-09-01&to=2026-09-14&tz=…).
// "1 Sep" means midnight in the *viewer's* timezone, but this runs on a
// server in UTC — taking the dates at face value would shift an NZ viewer's
// window by 12-13 hours. So the browser also sends its IANA timezone name and
// the dates are resolved to instants here, DST-correctly.

type YMD = { y: number; m: number; d: number };

function parseYmd(value: string | undefined): YMD | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Round-trip to reject calendar nonsense like 2026-02-31.
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

function formatYmd({ y, m, d }: YMD): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function validTimeZone(tz: string | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

// How far ahead of UTC the given zone's wall clock is at a given instant.
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wallAsUtc - Math.floor(utcMs / 1000) * 1000;
}

// The instant at which the given calendar date begins in `tz`. The offset is
// measured at the guess and re-measured at the result, because a DST change
// between the two (e.g. NZ springing forward on the last Sunday of
// September) would otherwise leave the answer an hour out.
function zonedMidnightMs({ y, m, d }: YMD, tz: string): number {
  const wallAsUtc = Date.UTC(y, m - 1, d);
  const first = wallAsUtc - tzOffsetMs(wallAsUtc, tz);
  const second = wallAsUtc - tzOffsetMs(first, tz);
  return second;
}

export type CustomRange = {
  from: string; // YYYY-MM-DD, as shown back in the date inputs
  to: string;
  startMs: number; // inclusive
  endMs: number; // exclusive: the start of the day *after* `to`
};

// null when either date is missing or invalid — the caller then falls back
// to a preset range. from/to given the wrong way round are swapped rather
// than rejected.
export function resolveCustomRange(
  from: string | undefined,
  to: string | undefined,
  tz: string | undefined,
): CustomRange | null {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return null;

  const [first, last] = Date.UTC(a.y, a.m - 1, a.d) <= Date.UTC(b.y, b.m - 1, b.d) ? [a, b] : [b, a];
  const zone = validTimeZone(tz);

  const dayAfter = new Date(Date.UTC(last.y, last.m - 1, last.d + 1));
  return {
    from: formatYmd(first),
    to: formatYmd(last),
    startMs: zonedMidnightMs(first, zone),
    endMs: zonedMidnightMs(
      { y: dayAfter.getUTCFullYear(), m: dayAfter.getUTCMonth() + 1, d: dayAfter.getUTCDate() },
      zone,
    ),
  };
}

// The presets above hand-pick a bucket width per range; an arbitrary span
// has to derive one: the narrowest tidy width that keeps a silo's line to
// ~400 points or fewer (a 2-week range gets 1-hour buckets, not 4,032s).
const BUCKET_STEPS = [60, 180, 300, 900, 1800, 3600, 7200, 21600, 43200, 86400, 604800];
const MAX_POINTS = 400;

export function bucketSecondsForSpan(spanMs: number): number {
  const minWidth = spanMs / 1000 / MAX_POINTS;
  return BUCKET_STEPS.find((step) => step >= minWidth) ?? BUCKET_STEPS[BUCKET_STEPS.length - 1];
}

export function axisForSpan(spanMs: number): "shortTime" | "shortDate" | "monthYear" {
  if (spanMs <= 36 * 3600_000) return "shortTime";
  if (spanMs <= 200 * 86400_000) return "shortDate";
  return "monthYear";
}

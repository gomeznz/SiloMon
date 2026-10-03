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

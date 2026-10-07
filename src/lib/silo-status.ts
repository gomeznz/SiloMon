export type SiloStatus = "ok" | "low" | "critical" | "high" | "offline";

// How long a silo can go without a fresh reading before it's treated as
// offline rather than trusting the last value. The worker (see
// scripts/silo-worker.ts) is expected to poll well inside this window —
// tune both together if the poll interval changes.
export const STALE_AFTER_MS = 2 * 60 * 1000;

// Tonnes of feed in the silo: the fill percentage applied to the
// manufacturer's full-silo feed weight. Null when no feed weight is set. The
// percentage is clamped to 0-100 because a silo can't hold more than its full
// weight (a sensor can over-read) or less than nothing.
export function feedStoredTonnes(percent: number, feedWeightTonnes: number | null): number | null {
  if (feedWeightTonnes === null) return null;
  return (Math.max(0, Math.min(100, percent)) / 100) * feedWeightTonnes;
}

export function statusFor(silo: {
  currentValue: string | null;
  lastReadAt: Date | null;
  capacity: string;
  lowAlarmPercent: string | null;
  highAlarmPercent: string | null;
  criticalPercent: string | null;
}): { status: SiloStatus; percent: number } {
  const percent = silo.currentValue ? (Number(silo.currentValue) / Number(silo.capacity)) * 100 : 0;

  if (!silo.lastReadAt || Date.now() - silo.lastReadAt.getTime() > STALE_AFTER_MS) {
    return { status: "offline", percent };
  }

  // Critical is the hard floor, so it's checked ahead of (and wins over)
  // the softer low-alarm threshold.
  if (silo.criticalPercent !== null && percent <= Number(silo.criticalPercent) * 100) {
    return { status: "critical", percent };
  }
  if (silo.lowAlarmPercent !== null && percent <= Number(silo.lowAlarmPercent) * 100) {
    return { status: "low", percent };
  }
  if (silo.highAlarmPercent !== null && percent >= Number(silo.highAlarmPercent) * 100) {
    return { status: "high", percent };
  }
  return { status: "ok", percent };
}

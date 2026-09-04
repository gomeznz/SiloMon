import { cn } from "@/lib/utils";
import type { SiloStatus } from "@/lib/silo-status";
import { LocalDateTime } from "@/components/local-date-time";

export type { SiloStatus } from "@/lib/silo-status";

// Linear percent-to-height mapping over the tank's full silhouette (dome +
// body + cone). It doesn't model the cone's actual volume — a real silo's
// bottom few percent occupy less width than the body — but that's the right
// tradeoff for a dashboard gauge: it reads as "mostly full" / "nearly empty"
// at a glance, which is all this needs to do.
const TOP_Y = 15;
const BOTTOM_Y = 155;
const RANGE = BOTTOM_Y - TOP_Y;

const STATUS_FILL: Record<SiloStatus, string> = {
  ok: "#6366f1", // indigo-500
  low: "#f59e0b", // amber-500
  critical: "#991b1b", // red-800 — the one alarm color that still means trouble
  high: "#10b981", // emerald-500 — well-stocked is good news, not a warning
  offline: "#94a3b8", // slate-400
};

const STATUS_BADGE: Record<SiloStatus, { label: string; className: string }> = {
  ok: { label: "OK", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  low: { label: "LOW", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  critical: { label: "CRITICAL", className: "bg-red-600 text-white dark:bg-red-600 dark:text-white" },
  high: { label: "HIGH", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  offline: { label: "OFFLINE", className: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
};

// Only "critical" gets a distinct card treatment (red background + pulse) —
// every other status is conveyed through the gauge fill and badge alone, so
// the card itself stays neutral and this alert reads as unmistakably
// different rather than one more color in the mix.
const CARD_BACKGROUND: Record<SiloStatus, string> = {
  ok: "border-slate-200/80 bg-gradient-to-b from-white to-slate-50 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950",
  low: "border-slate-200/80 bg-gradient-to-b from-white to-slate-50 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950",
  high: "border-slate-200/80 bg-gradient-to-b from-white to-slate-50 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950",
  offline: "border-slate-200/80 bg-gradient-to-b from-white to-slate-50 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950",
  critical: "border-red-300 bg-gradient-to-b from-red-50 to-red-100 animate-pulse dark:border-red-800 dark:from-red-950/60 dark:to-red-950/30",
};

const SILO_OUTLINE = "M 25 15 Q 60 0 95 15 L 95 118 L 60 155 L 25 118 Z";

export function SiloGauge({
  id,
  name,
  percent,
  currentValue,
  capacity,
  unit,
  status,
  lastReadAt,
}: {
  id: number;
  name: string;
  percent: number;
  currentValue: number | null;
  capacity: number;
  unit: string;
  status: SiloStatus;
  lastReadAt: Date | null;
}) {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const fillY = BOTTOM_Y - (clampedPercent / 100) * RANGE;
  const clipId = `silo-clip-${id}`;
  const badge = STATUS_BADGE[status];

  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border p-6 shadow-sm shadow-slate-200/60 dark:shadow-slate-950/60",
        CARD_BACKGROUND[status],
      )}
    >
      <svg viewBox="0 0 120 170" className="h-64 w-48">
        <defs>
          <clipPath id={clipId}>
            <path d={SILO_OUTLINE} />
          </clipPath>
        </defs>

        <path
          d={SILO_OUTLINE}
          className="fill-slate-100 dark:fill-slate-800"
        />

        <rect
          x={0}
          y={fillY}
          width={120}
          height={BOTTOM_Y - fillY + 15}
          fill={STATUS_FILL[status]}
          opacity={status === "offline" ? 0.5 : 1}
          clipPath={`url(#${clipId})`}
        />

        <path
          d={SILO_OUTLINE}
          fill="none"
          strokeWidth={3}
          className="stroke-slate-300 dark:stroke-slate-600"
        />

        <text
          x={60}
          y={90}
          textAnchor="middle"
          className="fill-slate-900 text-[28px] font-semibold dark:fill-white"
          style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 4, strokeOpacity: 0.6 }}
        >
          {Math.round(clampedPercent)}%
        </text>
      </svg>

      <div className="mt-2 text-center">
        <div className="text-base font-medium text-slate-900 dark:text-slate-100">{name}</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {currentValue !== null ? `${currentValue.toLocaleString()} / ${capacity.toLocaleString()} ${unit}` : "No data"}
        </div>
        <span className={cn("mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium", badge.className)}>
          {badge.label}
        </span>
        {lastReadAt && (
          <div className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            <LocalDateTime value={lastReadAt} mode="time" />
          </div>
        )}
      </div>
    </div>
  );
}

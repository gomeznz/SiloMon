import { cn } from "@/lib/utils";

export type SiloGaugeStatus = "ok" | "low" | "high" | "offline";

// Linear percent-to-height mapping over the tank's full silhouette (dome +
// body + cone). It doesn't model the cone's actual volume — a real silo's
// bottom few percent occupy less width than the body — but that's the right
// tradeoff for a dashboard gauge: it reads as "mostly full" / "nearly empty"
// at a glance, which is all this needs to do.
const TOP_Y = 15;
const BOTTOM_Y = 155;
const RANGE = BOTTOM_Y - TOP_Y;

const STATUS_FILL: Record<SiloGaugeStatus, string> = {
  ok: "#6366f1", // indigo-500
  low: "#f59e0b", // amber-500
  high: "#ef4444", // red-500
  offline: "#94a3b8", // slate-400
};

const STATUS_BADGE: Record<SiloGaugeStatus, { label: string; className: string }> = {
  ok: { label: "OK", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  low: { label: "LOW", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  high: { label: "HIGH", className: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
  offline: { label: "OFFLINE", className: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
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
  status: SiloGaugeStatus;
  lastReadAt: Date | null;
}) {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const fillY = BOTTOM_Y - (clampedPercent / 100) * RANGE;
  const clipId = `silo-clip-${id}`;
  const badge = STATUS_BADGE[status];

  return (
    <div className="flex flex-col items-center rounded-lg border border-slate-200/80 bg-gradient-to-b from-white to-slate-50 p-6 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
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
            {new Date(lastReadAt).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}

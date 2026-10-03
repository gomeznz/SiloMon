"use client";

import { useEffect, useRef, useState } from "react";
import { LocalDateTime, type LocalDateTimeMode } from "@/components/local-date-time";

// Hand-rolled SVG line chart — same approach as silo-gauge.tsx. The data
// (a handful of series, a few hundred points each at most) doesn't warrant
// pulling in a charting library.
//
// Colors are the app's own palette (the -400 shades read well against a
// dark background) — the same indigo/emerald/amber/red used for buttons and
// status badges elsewhere, extended with a few more hues from that family
// rather than an arbitrary rainbow.
const PALETTE = [
  "#818cf8", // indigo-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#f87171", // red-400
  "#38bdf8", // sky-400
  "#a78bfa", // violet-400
  "#fb7185", // rose-400
  "#2dd4bf", // teal-400
  "#fb923c", // orange-400
  "#a3e635", // lime-400
];

const WIDTH = 800;
const HEIGHT = 280;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 48 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

export type TrendSeries = {
  id: number;
  name: string;
  // Percent of the silo's capacity (0-100), not the raw reading — silos on
  // the same chart can have wildly different capacities, so plotting raw
  // values would put them on a scale that's meaningless across silos (and
  // a capacity edited mid-window would jump the whole axis). Percent keeps
  // every line on the same, actually comparable, 0-100 scale.
  points: { readAt: Date; value: number }[];
};

// Points arrive sorted by time, so the closest one to `time` can be found by
// bisection instead of scanning a few hundred points on every pointer move.
function nearestPoint(points: TrendSeries["points"], time: number) {
  if (points.length === 0) return null;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].readAt.getTime() < time) lo = mid + 1;
    else hi = mid;
  }

  // `lo` is the first point at or after `time`; the one just before it can
  // be the closer of the two.
  const after = points[lo];
  const before = points[lo - 1];
  if (!before) return after;
  return Math.abs(before.readAt.getTime() - time) <= Math.abs(after.readAt.getTime() - time) ? before : after;
}

export function SiloTrendChart({
  series,
  axisFormat = "shortTime",
  emptyMessage = "No trend data yet.",
}: {
  series: TrendSeries[];
  // How x-axis tick labels are written — clock times suit a window of hours,
  // but a week or a year of them would all read "14:00". It also decides
  // whether the tooltip shows a time of day: with year-scale ranges each
  // point is a whole day's average, so "12:00 am" would just be noise.
  axisFormat?: LocalDateTimeMode;
  emptyMessage?: string;
}) {
  // The time of the data point the pointer is nearest to, or null when the
  // tooltip is hidden. Held as a bare number so repeated pointer moves over
  // the same point are a no-op re-render.
  const [activeTime, setActiveTime] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isActive = activeTime !== null;

  // A tapped tooltip stays put on touch screens (there's no "pointer leaves"
  // to hide it), so tapping anywhere outside the chart dismisses it.
  useEffect(() => {
    if (!isActive) return;
    const dismiss = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setActiveTime(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [isActive]);

  const allPoints = series.flatMap((s) => s.points);

  if (allPoints.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>;
  }

  const times = allPoints.map((p) => p.readAt.getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeSpan = maxTime - minTime || 1;

  const MAX_PERCENT = 100;

  const x = (t: number) => MARGIN.left + ((t - minTime) / timeSpan) * PLOT_WIDTH;
  const y = (v: number) => MARGIN.top + PLOT_HEIGHT - (v / MAX_PERCENT) * PLOT_HEIGHT;

  const Y_TICKS = 4;
  const yTickValues = Array.from({ length: Y_TICKS + 1 }, (_, i) => (MAX_PERCENT / Y_TICKS) * i);

  const X_TICKS = 4;
  const xTickValues = Array.from({ length: X_TICKS + 1 }, (_, i) => minTime + (timeSpan / X_TICKS) * i);

  // Snap to the data point nearest the pointer (across every series), so the
  // crosshair always sits on a real reading rather than between two.
  function handlePointer(e: React.PointerEvent<SVGRectElement>) {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const viewBoxX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const pointerTime = minTime + ((viewBoxX - MARGIN.left) / PLOT_WIDTH) * timeSpan;

    let snapped: number | null = null;
    let snappedDistance = Infinity;
    for (const s of series) {
      const p = nearestPoint(s.points, pointerTime);
      if (!p) continue;
      const distance = Math.abs(p.readAt.getTime() - pointerTime);
      if (distance < snappedDistance) {
        snappedDistance = distance;
        snapped = p.readAt.getTime();
      }
    }
    setActiveTime(snapped);
  }

  // Each silo's value at the snapped time. A silo with no reading near that
  // moment (it was offline, or hadn't been added yet) is left out rather than
  // showing a value from a long way off.
  const tolerance = timeSpan / 50;
  const rows =
    activeTime === null
      ? []
      : series.flatMap((s, i) => {
          const p = nearestPoint(s.points, activeTime);
          if (!p || Math.abs(p.readAt.getTime() - activeTime) > tolerance) return [];
          return [{ id: s.id, name: s.name, color: PALETTE[i % PALETTE.length], value: p.value, time: p.readAt.getTime() }];
        });

  const showTooltip = activeTime !== null && rows.length > 0;
  const tooltipLeftPercent = activeTime === null ? 0 : (x(activeTime) / WIDTH) * 100;
  // Flip to the left of the crosshair on the right half so it never runs off the card.
  const flipLeft = tooltipLeftPercent > 55;

  return (
    <div ref={containerRef}>
      <div className="relative">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full">
          {yTickValues.map((v, i) => (
            <g key={i}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={y(v)}
                y2={y(v)}
                strokeWidth={1}
                className="stroke-slate-200 dark:stroke-slate-800"
              />
              <text
                x={MARGIN.left - 8}
                y={y(v)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-slate-400 text-[10px] dark:fill-slate-500"
              >
                {Math.round(v)}%
              </text>
            </g>
          ))}

          {xTickValues.map((t, i) => (
            <text
              key={i}
              x={x(t)}
              y={HEIGHT - MARGIN.bottom + 16}
              textAnchor="middle"
              className="fill-slate-400 text-[10px] dark:fill-slate-500"
            >
              <LocalDateTime value={t} mode={axisFormat} />
            </text>
          ))}

          {series.map((s, i) => {
            if (s.points.length === 0) return null;
            const color = PALETTE[i % PALETTE.length];

            if (s.points.length === 1) {
              const p = s.points[0];
              return <circle key={s.id} cx={x(p.readAt.getTime())} cy={y(p.value)} r={3} fill={color} />;
            }

            const d = s.points
              .map((p, idx) => `${idx === 0 ? "M" : "L"} ${x(p.readAt.getTime())} ${y(p.value)}`)
              .join(" ");
            return <path key={s.id} d={d} fill="none" stroke={color} strokeWidth={2} />;
          })}

          {showTooltip && activeTime !== null && (
            <g pointerEvents="none">
              <line
                x1={x(activeTime)}
                x2={x(activeTime)}
                y1={MARGIN.top}
                y2={MARGIN.top + PLOT_HEIGHT}
                strokeWidth={1}
                className="stroke-slate-400 dark:stroke-slate-500"
              />
              {rows.map((r) => (
                <circle
                  key={r.id}
                  cx={x(r.time)}
                  cy={y(r.value)}
                  r={4}
                  fill={r.color}
                  strokeWidth={2}
                  className="stroke-white dark:stroke-slate-900"
                />
              ))}
            </g>
          )}

          {/* Transparent hit area over the plot. touch-action pan-y lets a
              finger scrub sideways across the chart while a vertical swipe
              still scrolls the page. Mouse hides on leave; touch keeps the
              tooltip until a tap elsewhere (see the effect above). */}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            fill="transparent"
            className="cursor-crosshair"
            style={{ touchAction: "pan-y" }}
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") setActiveTime(null);
            }}
          />
        </svg>

        {showTooltip && activeTime !== null && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 min-w-36 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900/95"
            style={{
              left: `${tooltipLeftPercent}%`,
              top: `${(MARGIN.top / HEIGHT) * 100}%`,
              transform: flipLeft ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
            }}
          >
            <div className="mb-1.5 font-medium text-slate-900 dark:text-slate-100">
              {new Date(activeTime).toLocaleString(
                [],
                axisFormat === "monthYear" ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" },
              )}
            </div>
            <div className="space-y-1">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                    {r.name}
                  </span>
                  <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                    {r.value.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
            />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}

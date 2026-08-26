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

export function SiloTrendChart({ series }: { series: TrendSeries[] }) {
  const allPoints = series.flatMap((s) => s.points);

  if (allPoints.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No trend data yet.</p>;
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

  return (
    <div>
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
            {new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
      </svg>

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

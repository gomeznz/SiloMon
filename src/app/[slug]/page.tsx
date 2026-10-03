import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { silos, siloPages, siloReadings } from "@/db/schema";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveSiloGrid } from "@/components/live-silo-grid";
import { SiloTrendChart } from "@/components/silo-trend-chart";
import { TrendDateRangeForm } from "@/components/trend-date-range-form";
import { TrendRangeSelector } from "@/components/trend-range-selector";
import { statusFor } from "@/lib/silo-status";
import {
  TREND_RANGES,
  axisForSpan,
  bucketSecondsForSpan,
  parseTrendRange,
  resolveCustomRange,
  type CustomRange,
  type TrendRangeKey,
} from "@/lib/trend-range";

// Reads live DB state on every request — must not be statically prerendered
// at build time (the DB isn't reachable from the build environment anyway).
export const dynamic = "force-dynamic";

type TrendView = {
  startMs: number;
  endMs: number | null; // null = open-ended, i.e. "up to now"
  bucketSeconds: number;
  axis: "shortTime" | "shortDate" | "monthYear";
  preset: TrendRangeKey | null; // which preset button is active, if any
  custom: CustomRange | null;
};

// A valid custom from/to wins over a preset; anything else falls back to the
// preset (itself defaulting to 3h). Lives outside the component because it
// reads the clock, which React's purity lint disallows in a component body.
function resolveTrendView(query: { range?: string; from?: string; to?: string; tz?: string }): TrendView {
  const custom = resolveCustomRange(query.from, query.to, query.tz);
  if (custom) {
    const span = custom.endMs - custom.startMs;
    return {
      startMs: custom.startMs,
      endMs: custom.endMs,
      bucketSeconds: bucketSecondsForSpan(span),
      axis: axisForSpan(span),
      preset: null,
      custom,
    };
  }

  const preset = parseTrendRange(query.range);
  const { windowMs, bucketSeconds, axis } = TREND_RANGES[preset];
  return { startMs: Date.now() - windowMs, endMs: null, bucketSeconds, axis, preset, custom: null };
}

export default async function SiloPageDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string; tz?: string }>;
}) {
  const { slug } = await params;
  const view = resolveTrendView(await searchParams);
  const { bucketSeconds } = view;

  const [allPages, currentPage] = await Promise.all([
    db.select().from(siloPages).orderBy(asc(siloPages.sortOrder), asc(siloPages.id)),
    db.select().from(siloPages).where(eq(siloPages.slug, slug)).limit(1).then((r) => r[0]),
  ]);

  if (!currentPage) {
    notFound();
  }

  const pageSilos = await db
    .select()
    .from(silos)
    .where(eq(silos.pageId, currentPage.id))
    .orderBy(asc(silos.sortOrder), asc(silos.id));

  // Worst low/critical alarm per page, for the badge dot on each page tab
  // below — needs every page's silos, not just the current page's.
  const allSilos = await db
    .select({
      pageId: silos.pageId,
      currentValue: silos.currentValue,
      lastReadAt: silos.lastReadAt,
      capacity: silos.capacity,
      lowAlarmPercent: silos.lowAlarmPercent,
      highAlarmPercent: silos.highAlarmPercent,
      criticalPercent: silos.criticalPercent,
    })
    .from(silos);

  const pageAlarms = new Map<number, "critical" | "low">();
  for (const silo of allSilos) {
    const { status } = statusFor(silo);
    if (status !== "critical" && status !== "low") continue;
    if (pageAlarms.get(silo.pageId) === "critical") continue;
    pageAlarms.set(silo.pageId, status);
  }

  const siloIds = pageSilos.map((s) => s.id);

  // Readings are averaged into fixed-width time buckets in SQL rather than
  // fetched raw: the worker writes one row every ~10s, so a year is millions
  // of rows per silo. bucketSeconds is inlined (sql.raw) instead of bound as
  // a parameter because Postgres can't tell that `... / $1` in the SELECT and
  // `... / $2` in the GROUP BY are the same expression. It's always a number
  // from our own tables (a preset constant, or picked from BUCKET_STEPS) —
  // never text from the URL — so inlining it is safe.
  const bucket = sql<number>`floor(extract(epoch from ${siloReadings.readAt}) / ${sql.raw(String(bucketSeconds))})`.mapWith(
    Number,
  );
  const readings =
    siloIds.length > 0
      ? await db
          .select({
            siloId: siloReadings.siloId,
            bucket,
            value: sql<string>`avg(${siloReadings.value})`,
          })
          .from(siloReadings)
          .where(
            and(
              inArray(siloReadings.siloId, siloIds),
              gte(siloReadings.readAt, new Date(view.startMs)),
              view.endMs !== null ? lt(siloReadings.readAt, new Date(view.endMs)) : undefined,
            ),
          )
          .groupBy(siloReadings.siloId, bucket)
          .orderBy(asc(bucket))
      : [];

  const trendSeries = pageSilos.map((silo) => {
    const capacity = Number(silo.capacity);
    return {
      id: silo.id,
      name: silo.name,
      // Plotted as percent of the silo's current capacity, not the raw
      // reading — see the TrendSeries comment in silo-trend-chart.tsx for
      // why (different silos have different capacities, so raw values
      // aren't on a comparable scale).
      points: readings
        .filter((r) => r.siloId === silo.id)
        .map((r) => ({
          readAt: new Date(r.bucket * bucketSeconds * 1000),
          value: (Number(r.value) / capacity) * 100,
        })),
    };
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{currentPage.name}</h1>
        <Link href="/admin" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Setup
        </Link>
      </div>

      {allPages.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {allPages.map((p) => {
            const alarm = pageAlarms.get(p.id);
            return (
              <Link
                key={p.id}
                href={`/${p.slug}`}
                className={buttonVariants({ variant: p.slug === slug ? "default" : "outline", size: "sm" })}
              >
                {alarm && (
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      alarm === "critical" ? "bg-red-500" : "bg-amber-500",
                    )}
                  />
                )}
                {p.name}
              </Link>
            );
          })}
        </div>
      )}

      {pageSilos.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No silos on this page yet.
        </p>
      ) : (
        <LiveSiloGrid
          slug={slug}
          initialSilos={pageSilos.map((silo) => {
            const { status, percent } = statusFor(silo);
            return {
              id: silo.id,
              name: silo.name,
              status,
              percent,
              currentValue: silo.currentValue ? Number(silo.currentValue) : null,
              capacity: Number(silo.capacity),
              unit: silo.unit,
              lastReadAt: silo.lastReadAt ? silo.lastReadAt.toISOString() : null,
            };
          })}
        />
      )}

      {pageSilos.length > 0 && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Level trend</CardTitle>
            <TrendRangeSelector slug={slug} active={view.preset} />
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <TrendDateRangeForm
              slug={slug}
              from={view.custom?.from ?? null}
              to={view.custom?.to ?? null}
              active={view.custom !== null}
            />
            <SiloTrendChart
              series={trendSeries}
              axisFormat={view.axis}
              emptyMessage={view.custom ? "No readings were recorded in this date range." : undefined}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

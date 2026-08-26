import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { silos, siloPages, siloReadings } from "@/db/schema";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveSiloGrid } from "@/components/live-silo-grid";
import { SiloTrendChart } from "@/components/silo-trend-chart";
import { statusFor } from "@/lib/silo-status";

// How far back the trend chart looks. Kept short by default since the
// worker polls every few seconds — a longer window would mean fetching (and
// rendering) thousands of points per silo.
const TREND_WINDOW_MS = 3 * 60 * 60 * 1000;

// Reads live DB state on every request — must not be statically prerendered
// at build time (the DB isn't reachable from the build environment anyway).
export const dynamic = "force-dynamic";

function trendCutoff(): Date {
  return new Date(Date.now() - TREND_WINDOW_MS);
}

export default async function SiloPageDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

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
  const readings =
    siloIds.length > 0
      ? await db
          .select({ siloId: siloReadings.siloId, value: siloReadings.value, readAt: siloReadings.readAt })
          .from(siloReadings)
          .where(and(inArray(siloReadings.siloId, siloIds), gte(siloReadings.readAt, trendCutoff())))
          .orderBy(asc(siloReadings.readAt))
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
        .map((r) => ({ readAt: r.readAt, value: (Number(r.value) / capacity) * 100 })),
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
          <CardHeader>
            <CardTitle>Level trend</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <SiloTrendChart series={trendSeries} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

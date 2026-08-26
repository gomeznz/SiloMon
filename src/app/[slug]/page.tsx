import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { silos, siloPages } from "@/db/schema";
import { buttonVariants } from "@/components/ui/button";
import { SiloGauge, type SiloGaugeStatus } from "@/components/silo-gauge";

// How long a silo can go without a fresh reading before the dashboard shows
// it as offline rather than trusting the last value. The worker (see
// scripts/silo-worker.ts) is expected to poll well inside this window —
// tune both together if the poll interval changes.
const STALE_AFTER_MS = 2 * 60 * 1000;

// Reads live DB state on every request — must not be statically prerendered
// at build time (the DB isn't reachable from the build environment anyway).
export const dynamic = "force-dynamic";

function statusFor(silo: {
  currentValue: string | null;
  lastReadAt: Date | null;
  capacity: string;
  lowAlarmPercent: string | null;
  highAlarmPercent: string | null;
}): { status: SiloGaugeStatus; percent: number } {
  if (!silo.lastReadAt || Date.now() - silo.lastReadAt.getTime() > STALE_AFTER_MS) {
    return { status: "offline", percent: silo.currentValue ? (Number(silo.currentValue) / Number(silo.capacity)) * 100 : 0 };
  }

  const percent = (Number(silo.currentValue) / Number(silo.capacity)) * 100;
  if (silo.lowAlarmPercent !== null && percent <= Number(silo.lowAlarmPercent) * 100) {
    return { status: "low", percent };
  }
  if (silo.highAlarmPercent !== null && percent >= Number(silo.highAlarmPercent) * 100) {
    return { status: "high", percent };
  }
  return { status: "ok", percent };
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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">SiloMon</h1>
        <Link href="/admin" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Setup
        </Link>
      </div>

      {allPages.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {allPages.map((p) => (
            <Link
              key={p.id}
              href={`/${p.slug}`}
              className={buttonVariants({ variant: p.slug === slug ? "default" : "outline", size: "sm" })}
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}

      {pageSilos.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No silos on this page yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {pageSilos.map((silo) => {
            const { status, percent } = statusFor(silo);
            return (
              <SiloGauge
                key={silo.id}
                id={silo.id}
                name={silo.name}
                percent={percent}
                currentValue={silo.currentValue ? Number(silo.currentValue) : null}
                capacity={Number(silo.capacity)}
                unit={silo.unit}
                status={status}
                lastReadAt={silo.lastReadAt}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

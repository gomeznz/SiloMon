import { asc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { silos, siloPages } from "@/db/schema";
import { statusFor, type SiloStatus } from "@/lib/silo-status";

// Takes a db instance rather than importing the app's own db/index.ts
// singleton, so this same report-building logic can run both inside Next
// (the /api/report route) and inside the standalone worker process, which
// has its own separate connection (see scripts/silo-worker.ts) and can't
// use db/index.ts — that file is guarded with `import "server-only"`.
export type SiloReport = {
  site: string;
  generatedAt: string;
  pages: {
    name: string;
    slug: string;
    silos: {
      name: string;
      status: SiloStatus;
      percent: number;
      currentValue: number | null;
      capacity: number;
      unit: string;
      lastReadAt: string | null;
    }[];
  }[];
};

export async function buildSiloReport<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
): Promise<SiloReport> {
  const [pages, allSilos] = await Promise.all([
    db.select().from(siloPages).orderBy(asc(siloPages.sortOrder), asc(siloPages.id)),
    db.select().from(silos).orderBy(asc(silos.pageId), asc(silos.sortOrder), asc(silos.id)),
  ]);

  return {
    site: process.env.SITE_NAME || "SiloMon",
    generatedAt: new Date().toISOString(),
    pages: pages.map((p) => ({
      name: p.name,
      slug: p.slug,
      silos: allSilos
        .filter((s) => s.pageId === p.id)
        .map((s) => {
          const { status, percent } = statusFor(s);
          return {
            name: s.name,
            status,
            percent,
            currentValue: s.currentValue ? Number(s.currentValue) : null,
            capacity: Number(s.capacity),
            unit: s.unit,
            lastReadAt: s.lastReadAt ? s.lastReadAt.toISOString() : null,
          };
        }),
    })),
  };
}

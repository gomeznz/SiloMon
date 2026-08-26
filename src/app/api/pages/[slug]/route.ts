import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { silos, siloPages } from "@/db/schema";
import { statusFor } from "@/lib/silo-status";

// Polled client-side (see live-silo-grid.tsx) so the dashboard can react to
// a silo going critical without a full page reload. Same shared statusFor()
// the server-rendered page uses, so the two never disagree.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [page] = await db.select({ id: siloPages.id }).from(siloPages).where(eq(siloPages.slug, slug)).limit(1);
  if (!page) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pageSilos = await db
    .select()
    .from(silos)
    .where(eq(silos.pageId, page.id))
    .orderBy(asc(silos.sortOrder), asc(silos.id));

  return NextResponse.json({
    silos: pageSilos.map((silo) => {
      const { status, percent } = statusFor(silo);
      return {
        id: silo.id,
        name: silo.name,
        status,
        percent,
        currentValue: silo.currentValue ? Number(silo.currentValue) : null,
        capacity: Number(silo.capacity),
        unit: silo.unit,
        lastReadAt: silo.lastReadAt,
      };
    }),
  });
}

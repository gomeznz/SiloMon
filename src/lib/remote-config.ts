import { asc, eq, notInArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { appSettings, silos, siloPages } from "@/db/schema";
import type { SiteConfigContent } from "@/lib/site-config-schema";

// Reading this site's configuration out (for the first import to SiloCentral),
// and applying one SiloCentral has sent in. Takes a db instance rather than
// importing the app's singleton so it can run inside the standalone worker
// (which has its own connection and can't import src/db/index.ts), the same
// as buildSiloReport in src/lib/report.ts.
//
// Both directions use the validated wire shape in site-config-schema.ts;
// alarm levels are percentages 0-100 on the wire and fractions of capacity in
// the database, so they're converted here.

const toPercent = (fraction: string | null): number | null =>
  fraction === null ? null : Math.round(Number(fraction) * 100 * 1000) / 1000;
const toFraction = (percent: number | null): string | null => (percent === null ? null : (percent / 100).toFixed(3));

export async function exportConfig<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
): Promise<SiteConfigContent> {
  const [pages, allSilos] = await Promise.all([
    db.select().from(siloPages).orderBy(asc(siloPages.sortOrder), asc(siloPages.id)),
    db.select().from(silos).orderBy(asc(silos.pageId), asc(silos.sortOrder), asc(silos.id)),
  ]);
  const pageUidById = new Map(pages.map((p) => [p.id, p.uid]));

  return {
    pages: pages.map((p) => ({ uid: p.uid, name: p.name, slug: p.slug, sortOrder: p.sortOrder })),
    silos: allSilos.map((s) => ({
      uid: s.uid,
      pageUid: pageUidById.get(s.pageId) as string,
      name: s.name,
      sortOrder: s.sortOrder,
      host: s.host,
      port: s.port,
      unitId: s.unitId,
      registerAddress: s.registerAddress,
      dataType: s.dataType,
      scale: Number(s.scale),
      invertLevel: s.invertLevel,
      capacity: Number(s.capacity),
      unit: s.unit,
      feedWeightTonnes: s.feedWeightTonnes !== null ? Number(s.feedWeightTonnes) : null,
      lowAlarmPercent: toPercent(s.lowAlarmPercent),
      highAlarmPercent: toPercent(s.highAlarmPercent),
      criticalPercent: toPercent(s.criticalPercent),
      isActive: s.isActive,
    })),
  };
}

// Makes the local pages and silos exactly match `config`, all or nothing: it's
// one transaction, so a failure part-way leaves the previous configuration
// untouched. `config` must already have passed SiteConfigSchema.
//
//  - Matched by uid. A silo that's in `config` and already exists is UPDATED in
//    place, so its reading history (and live value) is kept even if it was
//    renamed, moved to another page or pointed at a different device.
//  - A uid not seen locally is created.
//  - A local page or silo whose uid is NOT in `config` was deleted in
//    SiloCentral, and is deleted here too (a deleted silo's readings go with
//    it).
// The live-state columns (currentValue, lastReadAt) are never touched.
export async function applyConfig<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
  config: SiteConfigContent,
  version: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existingPages = await tx.select().from(siloPages);
    const pageByUid = new Map(existingPages.map((p) => [p.uid, p]));
    const pageIdByUid = new Map<string, number>();

    // Slugs are unique, so renaming two pages onto each other's slug (a swap)
    // would collide part-way through. Park every existing slug somewhere
    // harmless first; each page then gets its real slug below.
    await tx.update(siloPages).set({ slug: sql`'__pending_' || ${siloPages.id}` });

    for (const page of config.pages) {
      const existing = pageByUid.get(page.uid);
      if (existing) {
        await tx
          .update(siloPages)
          .set({ name: page.name, slug: page.slug, sortOrder: page.sortOrder })
          .where(eq(siloPages.id, existing.id));
        pageIdByUid.set(page.uid, existing.id);
      } else {
        const [created] = await tx
          .insert(siloPages)
          .values({ uid: page.uid, name: page.name, slug: page.slug, sortOrder: page.sortOrder })
          .returning({ id: siloPages.id });
        pageIdByUid.set(page.uid, created.id);
      }
    }

    const existingSilos = await tx.select({ id: silos.id, uid: silos.uid }).from(silos);
    const siloByUid = new Map(existingSilos.map((s) => [s.uid, s]));

    for (const silo of config.silos) {
      const values = {
        pageId: pageIdByUid.get(silo.pageUid) as number,
        name: silo.name,
        sortOrder: silo.sortOrder,
        host: silo.host,
        port: silo.port,
        unitId: silo.unitId,
        registerAddress: silo.registerAddress,
        dataType: silo.dataType,
        scale: silo.scale.toFixed(4),
        invertLevel: silo.invertLevel,
        capacity: silo.capacity.toFixed(2),
        unit: silo.unit,
        feedWeightTonnes: silo.feedWeightTonnes !== null ? silo.feedWeightTonnes.toFixed(2) : null,
        lowAlarmPercent: toFraction(silo.lowAlarmPercent),
        highAlarmPercent: toFraction(silo.highAlarmPercent),
        criticalPercent: toFraction(silo.criticalPercent),
        isActive: silo.isActive,
      };

      const existing = siloByUid.get(silo.uid);
      if (existing) {
        await tx.update(silos).set(values).where(eq(silos.id, existing.id));
      } else {
        await tx.insert(silos).values({ uid: silo.uid, ...values });
      }
    }

    // Removed in SiloCentral -> removed here. (Silos first; a removed page's
    // silos would also cascade, but silos that merely moved off it must
    // survive, and they've already been re-pointed above.)
    const keepSiloUids = config.silos.map((s) => s.uid);
    await tx.delete(silos).where(keepSiloUids.length ? notInArray(silos.uid, keepSiloUids) : sql`true`);
    const keepPageUids = config.pages.map((p) => p.uid);
    await tx.delete(siloPages).where(keepPageUids.length ? notInArray(siloPages.uid, keepPageUids) : sql`true`);

    // Recording the applied version is what puts this site under management
    // (and makes the local Setup page read-only) — do it in the same
    // transaction so "applied" and "recorded as applied" can't disagree.
    await tx
      .insert(appSettings)
      .values({ id: 1, remoteConfigVersion: version, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: { remoteConfigVersion: version, updatedAt: new Date() },
      });
  });
}

// Hands control of pages and silos back to this site's own Setup page.
export async function releaseManagement<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
): Promise<void> {
  await db
    .insert(appSettings)
    .values({ id: 1, remoteConfigVersion: 0, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { remoteConfigVersion: 0, updatedAt: new Date() },
    });
}

export async function getRemoteConfigVersion<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
): Promise<number> {
  const [row] = await db
    .select({ v: appSettings.remoteConfigVersion })
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  return row?.v ?? 0;
}

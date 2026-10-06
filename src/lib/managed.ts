import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";

// True while SiloCentral manages this site's pages and silos (see
// src/lib/remote-config.ts), during which they can only be changed there.
export async function isManagedByCentral(): Promise<boolean> {
  const [row] = await db
    .select({ v: appSettings.remoteConfigVersion })
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  return (row?.v ?? 0) > 0;
}

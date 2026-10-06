import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";

// Single-row table — always id 1 — for config that used to live in .env.
// Specifically the central-dashboard push settings: those get copied in
// from a different app's UI (SiloCentral's /admin) each time a key is
// rotated, which made SSH-and-edit-.env-and-restart a genuinely clumsy
// workflow. Reading this from the DB instead also means a change takes
// effect on the worker's next push tick — no restart needed.
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  centralDashboardUrl: text("central_dashboard_url"),
  centralApiKey: text("central_api_key"),
  // 0 = this site's pages and silos are edited locally (the default). Above 0
  // = SiloCentral manages them and this is the config version last applied;
  // the local Setup page then goes read-only for pages and silos so the two
  // places can't fight over the same setting. See src/lib/remote-config.ts.
  remoteConfigVersion: integer("remote_config_version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

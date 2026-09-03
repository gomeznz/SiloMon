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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

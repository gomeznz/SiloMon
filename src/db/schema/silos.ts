import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

export const siloRegisterDataTypeEnum = pgEnum("silo_register_data_type", [
  "UINT16",
  "INT16",
  "UINT32",
  "INT32",
  "FLOAT32",
]);

// A configurable dashboard sub-page grouping a set of silos — e.g. one page
// per site or yard. sortOrder controls both the page-tab order and (via
// silos.sortOrder within a page) the grid order.
export const siloPages = pgTable("silo_pages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Config plus last-known live state. The live-state columns (currentValue,
// lastReadAt) are written in place by the standalone Modbus-TCP polling
// worker (scripts/silo-worker.ts) — it runs as its own process, not inside a
// Next.js request, so the dashboard only ever reads what the worker last
// wrote here. lastReadAt going stale (rather than any flag the worker sets)
// is what the dashboard uses to detect an offline device.
export const silos = pgTable("silos", {
  id: serial("id").primaryKey(),
  pageId: integer("page_id")
    .notNull()
    .references(() => siloPages.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),

  // Modbus-TCP addressing
  host: text("host").notNull(),
  port: integer("port").notNull().default(502),
  unitId: integer("unit_id").notNull().default(1),
  registerAddress: integer("register_address").notNull(),
  dataType: siloRegisterDataTypeEnum("data_type").notNull().default("UINT16"),
  scale: numeric("scale", { precision: 10, scale: 4 }).notNull().default("1"),

  // Capacity/unit turn a raw register reading into a fill percentage
  capacity: numeric("capacity", { precision: 12, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("t"),

  // Alarm thresholds, as a fraction of capacity (0-1) — nullable, since not
  // every silo needs all three. criticalPercent is the hard floor — the
  // absolute lowest tolerable level, below lowAlarmPercent — and is what
  // triggers the red card + sound alert on the dashboard, not just a badge.
  lowAlarmPercent: numeric("low_alarm_percent", { precision: 4, scale: 3 }),
  highAlarmPercent: numeric("high_alarm_percent", { precision: 4, scale: 3 }),
  criticalPercent: numeric("critical_percent", { precision: 4, scale: 3 }),

  isActive: boolean("is_active").notNull().default(true),

  // Live state written by the worker
  currentValue: numeric("current_value", { precision: 12, scale: 2 }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Append-only trend history — the worker inserts one row per successful
// poll. Kept separate from silos' live-state columns so history can grow
// without bloating the row the dashboard re-reads on every request.
export const siloReadings = pgTable("silo_readings", {
  id: serial("id").primaryKey(),
  siloId: integer("silo_id")
    .notNull()
    .references(() => silos.id, { onDelete: "cascade" }),
  value: numeric("value", { precision: 12, scale: 2 }).notNull(),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
});

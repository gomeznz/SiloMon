import { z } from "zod";

// The shape of a site's configuration as it travels between SiloCentral and a
// SiloMon site. THIS FILE IS DUPLICATED, byte for byte, in both repos
// (src/lib/site-config-schema.ts) — they're separate deployable projects with
// no shared package — so change both together.
//
// It is validated on BOTH ends: SiloCentral before it saves an edit, and the
// Pi again before it applies anything it receives. The Pi never trusts what
// arrives, because these values decide which hosts and ports it opens network
// connections to.

export const DATA_TYPES = ["UINT16", "INT16", "UINT32", "INT32", "FLOAT32"] as const;

// Opaque, stable identity (a UUID in practice). Lets both sides recognise "the
// same silo" after it has been renamed, moved or reordered.
const Uid = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9-]+$/, "Invalid id");

const sortOrder = z.number().int().min(0).max(100_000);
// Alarm levels travel as percentages 0-100 (the same as in the forms), or null
// when not set. SiloMon stores them as fractions of capacity internally.
const alarmPercent = z.number().min(0).max(100).nullable();

export const ConfigPageSchema = z.object({
  uid: Uid,
  name: z.string().trim().min(1, "Enter a page name").max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug: lowercase letters, numbers and single dashes"),
  sortOrder,
});

export const ConfigSiloSchema = z.object({
  uid: Uid,
  pageUid: Uid,
  name: z.string().trim().min(1, "Enter a silo name").max(100),
  sortOrder,

  // Modbus-TCP addressing. The host is deliberately restricted to characters
  // that can appear in a hostname or an IP address: no spaces, slashes, "@" or
  // anything else that could smuggle in something other than a plain host.
  host: z
    .string()
    .trim()
    .min(1, "Enter the Modbus host / IP")
    .max(253)
    .regex(/^[A-Za-z0-9._:-]+$/, "Host: letters, numbers, dots, dashes and colons only"),
  port: z.number().int().min(1).max(65535),
  unitId: z.number().int().min(0).max(255),
  // The protocol (0-based) register address, not a 4xxxx Modicon number.
  registerAddress: z.number().int().min(0).max(65535),
  dataType: z.enum(DATA_TYPES),
  scale: z
    .number()
    .refine((v) => Number.isFinite(v) && v !== 0 && Math.abs(v) < 1_000_000, "Scale must be non-zero and under 1,000,000"),
  invertLevel: z.boolean(),

  capacity: z.number().positive("Capacity must be above zero").lt(10_000_000_000),
  unit: z.string().trim().min(1, "Enter a unit").max(20),
  // Manufacturer's feed weight at full, in tonnes (the sensor `capacity`/`unit`
  // above describe the reading, not this). Optional, and defaulted so that a
  // configuration from an older site, which has no such field, still parses.
  feedWeightTonnes: z.number().positive("Feed weight must be above zero").max(1_000_000).nullable().default(null),
  lowAlarmPercent: alarmPercent,
  highAlarmPercent: alarmPercent,
  criticalPercent: alarmPercent,

  isActive: z.boolean(),
});

export const SiteConfigSchema = z
  .object({
    pages: z.array(ConfigPageSchema).max(100),
    silos: z.array(ConfigSiloSchema).max(500),
  })
  .superRefine((config, ctx) => {
    const pageUids = new Set<string>();
    const slugs = new Set<string>();
    for (const [i, page] of config.pages.entries()) {
      if (pageUids.has(page.uid)) ctx.addIssue({ code: "custom", path: ["pages", i, "uid"], message: "Duplicate page id" });
      if (slugs.has(page.slug)) ctx.addIssue({ code: "custom", path: ["pages", i, "slug"], message: `Another page already uses "${page.slug}"` });
      pageUids.add(page.uid);
      slugs.add(page.slug);
    }

    const siloUids = new Set<string>();
    for (const [i, silo] of config.silos.entries()) {
      if (siloUids.has(silo.uid)) ctx.addIssue({ code: "custom", path: ["silos", i, "uid"], message: "Duplicate silo id" });
      if (!pageUids.has(silo.pageUid)) ctx.addIssue({ code: "custom", path: ["silos", i, "pageUid"], message: "Silo is on a page that doesn't exist" });
      siloUids.add(silo.uid);
    }
  });

export type SiteConfigContent = z.infer<typeof SiteConfigSchema>;
export type ConfigPage = z.infer<typeof ConfigPageSchema>;
export type ConfigSilo = z.infer<typeof ConfigSiloSchema>;

// What the heartbeat reply tells a site about its configuration.
export type HeartbeatReply = {
  ok: true;
  // true once an admin has taken over this site's configuration in SiloCentral
  managed: boolean;
  // the current desired version (0 when SiloCentral holds nothing for the site)
  configVersion: number;
  // true when SiloCentral wants the site to send its current configuration up
  wantsImport: boolean;
};

// A configuration plus the version it is, as served by GET /api/config.
export type SiteConfig = SiteConfigContent & { version: number };

export function formatConfigIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "config"}: ${i.message}`)
    .join("; ");
}

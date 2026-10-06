import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import { applyConfig, exportConfig, getRemoteConfigVersion, releaseManagement } from "@/lib/remote-config";
import {
  SiteConfigSchema,
  formatConfigIssues,
  type HeartbeatReply,
} from "@/lib/site-config-schema";

// The site's half of remote configuration, run by the worker after each
// heartbeat. SiloCentral never connects to the Pi — the Pi asks. The heartbeat
// reply says what SiloCentral wants, and this does it:
//
//   managed=false but we're still locked  -> release: local editing returns
//   wantsImport                           -> send our current config up
//   managed and a newer version exists    -> fetch, validate, apply, acknowledge
//
// Failures never throw out of here (the worker keeps polling its PLCs
// regardless); they're logged and, for a bad config, reported back so the
// admin sees why in SiloCentral.

const REQUEST_TIMEOUT_MS = 15_000;
// A config the Pi can't apply is retried at most this often rather than every
// 30 seconds, so a bad edit doesn't spin or flood SiloCentral with errors.
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;

export type SyncState = { failedVersion?: number; failedAt?: number };

type Context = {
  centralUrl: string;
  apiKey: string;
  reply: Partial<HeartbeatReply>;
  state: SyncState;
};

const ConfigResponseSchema = z.object({ version: z.number().int().positive() }).passthrough();

export async function syncRemoteConfig<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
  { centralUrl, apiKey, reply, state }: Context,
): Promise<void> {
  // An older SiloCentral that doesn't know about remote configuration replies
  // without these fields. Treat that as "nothing to do" — never as an
  // instruction to release a site that is under management.
  if (typeof reply.managed !== "boolean" || typeof reply.configVersion !== "number") return;

  const headers = { Authorization: `Bearer ${apiKey}` };
  const local = await getRemoteConfigVersion(db);

  if (!reply.managed) {
    if (local > 0) {
      await releaseManagement(db);
      console.log("SiloCentral released management of this site — local Setup editing is enabled again.");
    }
    if (!reply.wantsImport) return;
  }

  if (reply.wantsImport) {
    try {
      const config = await exportConfig(db);
      const res = await fetch(`${centralUrl}/api/config/import`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(config),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        console.log(`Sent this site's configuration to SiloCentral (${config.pages.length} pages, ${config.silos.length} silos).`);
      } else {
        console.error(`Configuration import failed: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      console.error("Configuration import failed:", err instanceof Error ? err.message : err);
    }
    return;
  }

  if (reply.configVersion <= local) return;

  if (
    state.failedVersion === reply.configVersion &&
    state.failedAt !== undefined &&
    Date.now() - state.failedAt < RETRY_AFTER_FAILURE_MS
  ) {
    return;
  }

  let version = reply.configVersion;
  try {
    const res = await fetch(`${centralUrl}/api/config`, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`SiloCentral returned ${res.status} for the configuration`);
    const body: unknown = await res.json();

    const meta = ConfigResponseSchema.safeParse(body);
    if (!meta.success) throw new Error("SiloCentral sent a configuration with no version");
    version = meta.data.version;

    // Never apply anything that hasn't passed the same validation SiloCentral
    // applied before saving it — these values decide which hosts and ports
    // this Pi opens network connections to.
    const parsed = SiteConfigSchema.safeParse(body);
    if (!parsed.success) throw new Error(`Rejected an invalid configuration (${formatConfigIssues(parsed.error)})`);

    await applyConfig(db, parsed.data, version);
    state.failedVersion = undefined;
    state.failedAt = undefined;
    console.log(`Applied configuration v${version} from SiloCentral (${parsed.data.pages.length} pages, ${parsed.data.silos.length} silos).`);
    await acknowledge(centralUrl, headers, version, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state.failedVersion = reply.configVersion;
    state.failedAt = Date.now();
    console.error(`Could not apply configuration v${reply.configVersion}: ${message}`);
    await acknowledge(centralUrl, headers, version, false, message);
  }
}

async function acknowledge(
  centralUrl: string,
  headers: Record<string, string>,
  version: number,
  ok: boolean,
  error?: string,
): Promise<void> {
  try {
    const res = await fetch(`${centralUrl}/api/config/ack`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ version, ok, error: error?.slice(0, 500) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) console.error(`Configuration acknowledgement failed: ${res.status}`);
  } catch (err) {
    console.error("Configuration acknowledgement failed:", err instanceof Error ? err.message : err);
  }
}

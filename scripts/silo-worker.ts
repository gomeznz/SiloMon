// Standalone Modbus-TCP polling worker for the SiloMon dashboard.
//
// Deliberately NOT part of the Next.js app: it holds long-lived TCP sockets
// to industrial gateways and polls them on its own interval, which doesn't
// fit the request/response lifecycle of a Next.js server. Run it as its own
// process (e.g. a separate Railway service in this project, sharing
// DATABASE_URL) via:
//
//   npm run worker
//
// It only writes to the silos/silo_readings tables — the dashboard (see
// src/app) only ever reads what this process last wrote.
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import ModbusRTU from "modbus-serial";
import { silos, siloReadings, appSettings } from "../src/db/schema";
import { decodeRegisters, registerLength } from "../src/lib/modbus-codec";
import { buildSiloReport } from "../src/lib/report";
import { syncRemoteConfig, type SyncState } from "../src/lib/remote-config-sync";
import type { HeartbeatReply } from "../src/lib/site-config-schema";

const POLL_INTERVAL_MS = Number(process.env.SILO_POLL_INTERVAL_MS ?? 10_000);
const CONNECT_TIMEOUT_MS = Number(process.env.SILO_CONNECT_TIMEOUT_MS ?? 5_000);
const REPORT_PUSH_INTERVAL_MS = Number(process.env.REPORT_PUSH_INTERVAL_MS ?? 60_000);
// The central dashboard shows a site as offline after 2 minutes of silence,
// so this has to stay comfortably under that — 30s leaves room for several
// missed pings.
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 30_000);

type SiloRow = typeof silos.$inferSelect;

// One persistent client per host:port, reused across polls and shared by
// every silo on that gateway — reconnecting every poll is slow and most
// industrial Modbus-TCP gateways only accept one connection at a time.
const clients = new Map<string, ModbusRTU>();

async function getClient(host: string, port: number): Promise<ModbusRTU> {
  const key = `${host}:${port}`;
  const existing = clients.get(key);
  if (existing?.isOpen) return existing;

  const client = new ModbusRTU();
  client.setTimeout(CONNECT_TIMEOUT_MS);
  await client.connectTCP(host, { port });
  clients.set(key, client);
  return client;
}

async function pollSilo(db: ReturnType<typeof drizzle>, silo: SiloRow) {
  try {
    const client = await getClient(silo.host, silo.port);
    client.setID(silo.unitId);

    const length = registerLength(silo.dataType);
    const { data } = await client.readHoldingRegisters(silo.registerAddress, length);
    const reading = decodeRegisters(data, silo.dataType) * Number(silo.scale);
    // Some sensors report empty space above the product, not product depth —
    // see the invertLevel column comment in src/db/schema/silos.ts.
    const value = silo.invertLevel
      ? Math.max(0, Math.min(Number(silo.capacity), Number(silo.capacity) - reading))
      : reading;

    await db
      .update(silos)
      .set({ currentValue: value.toFixed(2), lastReadAt: new Date() })
      .where(eq(silos.id, silo.id));
    await db.insert(siloReadings).values({ siloId: silo.id, value: value.toFixed(2) });

    console.log(`[silo ${silo.id}] ${silo.name}: ${value.toFixed(2)} ${silo.unit}`);
  } catch (err) {
    console.error(
      `[silo ${silo.id}] ${silo.name}: poll failed —`,
      err instanceof Error ? err.message : err,
    );
    // Drop the cached client so the next poll reconnects instead of retrying
    // against a socket the gateway may have already closed.
    clients.get(`${silo.host}:${silo.port}`)?.close(() => {});
    clients.delete(`${silo.host}:${silo.port}`);
  }
}

async function tick(db: ReturnType<typeof drizzle>) {
  const activeSilos = await db.select().from(silos).where(eq(silos.isActive, true));

  const byGateway = new Map<string, SiloRow[]>();
  for (const silo of activeSilos) {
    const key = `${silo.host}:${silo.port}`;
    byGateway.set(key, [...(byGateway.get(key) ?? []), silo]);
  }

  // A silo's host or port can now be changed remotely (SiloCentral), so close
  // connections to gateways nothing points at any more instead of holding
  // them open forever.
  for (const [key, client] of clients) {
    if (!byGateway.has(key)) {
      client.close(() => {});
      clients.delete(key);
    }
  }

  // Different gateways poll in parallel; silos sharing one gateway poll
  // sequentially, since a single Modbus-TCP connection handles one
  // request/response conversation at a time.
  await Promise.all(
    [...byGateway.values()].map(async (group) => {
      for (const silo of group) await pollSilo(db, silo);
    }),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pushing to a central dashboard is opt-in and configured from the Setup
// page (Central dashboard card), not env vars — read fresh from the DB on
// every tick so a change there takes effect on the next push, no restart
// needed. Separate from REPORTING_API_KEY (src/app/api/report/route.ts):
// that key protects requests coming IN to this site; the API key stored
// here is the one this site was issued BY the central dashboard, for
// requests going OUT to it.
async function pushReport(db: ReturnType<typeof drizzle>) {
  const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  if (!settings?.centralDashboardUrl || !settings?.centralApiKey) return;

  try {
    const report = await buildSiloReport(db);
    const res = await fetch(`${settings.centralDashboardUrl}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.centralApiKey}` },
      body: JSON.stringify(report),
    });
    if (!res.ok) {
      console.error(`Report push failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("Report push failed:", err instanceof Error ? err.message : err);
  }
}

// A tiny "I'm alive" ping so the central dashboard can tell an online site
// from a dead one within a couple of minutes, without sending (or storing)
// a whole report. Deliberately sent from this worker rather than from the
// web app: the worker is what polls the PLCs, so it going quiet is exactly
// the failure worth flagging — and because it first reads its settings from
// the database, a site whose database is down stops pinging too, which is
// the right answer for "is this site working". Everything is inside the try
// so a failed ping is only logged, never an unhandled rejection that takes
// the worker down; the timeout stops one hung request from stacking up
// behind the next.
// Remembers a configuration version this Pi failed to apply, so it isn't
// retried every 30 seconds — see RETRY_AFTER_FAILURE_MS in remote-config-sync.
const configSyncState: SyncState = {};

async function sendHeartbeat(db: ReturnType<typeof drizzle>) {
  try {
    const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
    if (!settings?.centralDashboardUrl || !settings?.centralApiKey) return;

    const res = await fetch(`${settings.centralDashboardUrl}/api/heartbeat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.centralApiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`Heartbeat failed: ${res.status}`);
      return;
    }

    // The reply also says whether SiloCentral has configuration for this site
    // to hand over (or wants ours). An old SiloCentral replies with just
    // { ok: true }, which syncRemoteConfig treats as "nothing to do".
    const reply = (await res.json().catch(() => ({}))) as Partial<HeartbeatReply>;
    await syncRemoteConfig(db, {
      centralUrl: settings.centralDashboardUrl,
      apiKey: settings.centralApiKey,
      reply,
      state: configSyncState,
    });
  } catch (err) {
    console.error("Heartbeat failed:", err instanceof Error ? err.message : err);
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const queryClient = postgres(connectionString, { max: 5 });
  const db = drizzle(queryClient);

  console.log(`Silo worker starting — polling every ${POLL_INTERVAL_MS}ms`);
  console.log(
    `Checking for central dashboard config every ${REPORT_PUSH_INTERVAL_MS}ms (set on the Setup page — no-op until configured)`,
  );
  console.log(`Sending a heartbeat to the central dashboard every ${HEARTBEAT_INTERVAL_MS}ms once configured`);
  const pushInterval = setInterval(() => pushReport(db), REPORT_PUSH_INTERVAL_MS);
  // First ping straight away, so a restarted site shows online at once
  // instead of after the first interval.
  void sendHeartbeat(db);
  const heartbeatInterval = setInterval(() => sendHeartbeat(db), HEARTBEAT_INTERVAL_MS);

  let shuttingDown = false;
  const requestShutdown = () => {
    shuttingDown = true;
  };
  process.on("SIGINT", requestShutdown);
  process.on("SIGTERM", requestShutdown);

  while (!shuttingDown) {
    const startedAt = Date.now();
    await tick(db).catch((err) => console.error("Poll cycle failed:", err));
    const elapsed = Date.now() - startedAt;
    await sleep(Math.max(0, POLL_INTERVAL_MS - elapsed));
  }

  clearInterval(pushInterval);
  clearInterval(heartbeatInterval);
  for (const client of clients.values()) client.close(() => {});
  await queryClient.end();
  console.log("Silo worker stopped.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

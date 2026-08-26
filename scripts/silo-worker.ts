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
import { silos, siloReadings } from "../src/db/schema";
import { decodeRegisters, registerLength } from "../src/lib/modbus-codec";

const POLL_INTERVAL_MS = Number(process.env.SILO_POLL_INTERVAL_MS ?? 10_000);
const CONNECT_TIMEOUT_MS = Number(process.env.SILO_CONNECT_TIMEOUT_MS ?? 5_000);

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
    const value = decodeRegisters(data, silo.dataType) * Number(silo.scale);

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

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const queryClient = postgres(connectionString, { max: 5 });
  const db = drizzle(queryClient);

  console.log(`Silo worker starting — polling every ${POLL_INTERVAL_MS}ms`);

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

  for (const client of clients.values()) client.close(() => {});
  await queryClient.end();
  console.log("Silo worker stopped.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

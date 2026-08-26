// Modbus-TCP simulator for testing SiloMon without real hardware.
//
// Serves whatever silos are configured in the database: for each one, it
// fabricates a slowly-drifting fill level and encodes it through the same
// register/dataType/scale rules the real worker (scripts/silo-worker.ts)
// decodes (see src/lib/modbus-codec.ts, shared by both). Pointing a test
// silo's host/port at this service therefore exercises the real Modbus-TCP
// read + decode path end to end, not a shortcut around it.
//
// Deploy as its own Railway service in this project — no public domain
// needed, other services reach it over Railway's private network at
// <service-name>.railway.internal:<port>. Then in /admin add a silo whose
// host/port point here, with whatever registerAddress/unitId/dataType/
// capacity you want to exercise. Run locally via:
//
//   npm run simulator
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { ServerTCP } from "modbus-serial";
import { silos } from "../src/db/schema";
import { encodeValue } from "../src/lib/modbus-codec";

const SIM_PORT = Number(process.env.SIM_PORT ?? 502);
const REFRESH_INTERVAL_MS = Number(process.env.SIM_REFRESH_INTERVAL_MS ?? 5_000);
// How far a silo's simulated fill level can drift, in percentage points,
// each time it's read — keeps successive polls looking like a real slowly
// filling/draining silo rather than random noise.
const MAX_STEP_PERCENT = 2;

type SiloRow = typeof silos.$inferSelect;

let cachedSilos: SiloRow[] = [];
const levels = new Map<number, number>();

async function refreshSilos(db: ReturnType<typeof drizzle>) {
  try {
    cachedSilos = await db.select().from(silos);
  } catch (err) {
    console.error("Failed to refresh silo list:", err);
  }
}

function nextLevelPercent(siloId: number): number {
  const current = levels.get(siloId) ?? 20 + Math.random() * 60;
  const next = Math.max(0, Math.min(100, current + (Math.random() * 2 - 1) * MAX_STEP_PERCENT));
  levels.set(siloId, next);
  return next;
}

// Looks up which configured silo owns (address, unitID) and returns its
// next simulated reading, encoded to exactly `length` registers. Unmatched
// addresses (nothing configured to point here yet) read back as zero rather
// than erroring, since a real device would still answer for an address it
// happens to have wired up.
function readRegisters(address: number, length: number, unitID: number): number[] {
  const silo = cachedSilos.find((s) => s.registerAddress === address && s.unitId === unitID);
  if (!silo) return new Array(length).fill(0);

  const percent = nextLevelPercent(silo.id);
  const rawValue = ((percent / 100) * Number(silo.capacity)) / Number(silo.scale);
  const registers = encodeValue(rawValue, silo.dataType);

  if (registers.length === length) return registers;
  if (registers.length > length) return registers.slice(0, length);
  return [...registers, ...new Array(length - registers.length).fill(0)];
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const queryClient = postgres(connectionString, { max: 5 });
  const db = drizzle(queryClient);

  await refreshSilos(db);
  setInterval(() => refreshSilos(db), REFRESH_INTERVAL_MS);

  const server = new ServerTCP(
    {
      getHoldingRegister: (address: number, unitID: number) => readRegisters(address, 1, unitID)[0],
      getMultipleHoldingRegisters: (address: number, length: number, unitID: number) =>
        readRegisters(address, length, unitID),
    },
    { host: "0.0.0.0", port: SIM_PORT },
  );

  server.on("error", (err) => console.error("Simulator server error:", err));
  server.on("initialized", () => {
    console.log(`Silo simulator listening on :${SIM_PORT} — ${cachedSilos.length} silo(s) configured so far`);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

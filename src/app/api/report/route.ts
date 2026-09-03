import { NextResponse } from "next/server";
import { db } from "@/db";
import { buildSiloReport } from "@/lib/report";

// General-purpose reporting endpoint — for any external tool that wants
// this site's current silo data, not just the central dashboard (which
// instead gets pushed a copy of the same payload by the worker; see
// CENTRAL_DASHBOARD_URL in scripts/silo-worker.ts).
//
// Disabled (503) unless REPORTING_API_KEY is set, rather than defaulting to
// open — this is the one endpoint in the app meant to be reachable from
// outside the local network, so it shouldn't be exposed by accident.
export async function GET(request: Request) {
  const expectedKey = process.env.REPORTING_API_KEY;
  if (!expectedKey) {
    return NextResponse.json(
      { error: "Reporting API is not configured — set REPORTING_API_KEY to enable it." },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const providedKey = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (providedKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await buildSiloReport(db);
  return NextResponse.json(report);
}

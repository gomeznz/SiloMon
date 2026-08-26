"use client";

import { useEffect, useRef, useState } from "react";
import { SiloGauge } from "@/components/silo-gauge";
import type { SiloStatus } from "@/lib/silo-status";
import { playCriticalAlert } from "@/lib/alert-sound";

export type LiveSilo = {
  id: number;
  name: string;
  status: SiloStatus;
  percent: number;
  currentValue: number | null;
  capacity: number;
  unit: string;
  lastReadAt: string | null; // ISO string over JSON — see route.ts
};

// How often the browser re-checks silo status while the dashboard is open.
// Independent of the worker's own poll interval — this just needs to be
// frequent enough that a critical alert doesn't sit unnoticed for long.
const POLL_INTERVAL_MS = 15_000;

export function LiveSiloGrid({ slug, initialSilos }: { slug: string; initialSilos: LiveSilo[] }) {
  const [silos, setSilos] = useState(initialSilos);
  const previousStatuses = useRef(new Map(initialSilos.map((s) => [s.id, s.status])));

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/pages/${slug}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const data: { silos: LiveSilo[] } = await res.json();
        if (cancelled) return;

        // Edge-triggered: alert only on the transition into critical, not
        // on every poll a silo happens to still be critical — otherwise
        // the beep would repeat every 15s for as long as the level stays
        // low, which is more annoying than useful.
        const wentCritical = data.silos.some(
          (s) => s.status === "critical" && previousStatuses.current.get(s.id) !== "critical",
        );
        if (wentCritical) playCriticalAlert();

        previousStatuses.current = new Map(data.silos.map((s) => [s.id, s.status]));
        setSilos(data.silos);
      } catch {
        // A missed poll just leaves the last-known data on screen a little
        // longer — not worth surfacing as an error.
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [slug]);

  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
      {silos.map((silo) => (
        <SiloGauge
          key={silo.id}
          id={silo.id}
          name={silo.name}
          percent={silo.percent}
          currentValue={silo.currentValue}
          capacity={silo.capacity}
          unit={silo.unit}
          status={silo.status}
          lastReadAt={silo.lastReadAt ? new Date(silo.lastReadAt) : null}
        />
      ))}
    </div>
  );
}

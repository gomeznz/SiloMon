import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { silos, siloPages } from "@/db/schema";
import {
  createSiloPageAction,
  deleteSiloPageAction,
  createSiloAction,
  deleteSiloAction,
} from "../actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DATA_TYPES = ["UINT16", "INT16", "UINT32", "INT32", "FLOAT32"] as const;

// Reads live DB state on every request — must not be statically prerendered
// at build time (the DB isn't reachable from the build environment anyway).
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const [pages, allSilos] = await Promise.all([
    db.select().from(siloPages).orderBy(asc(siloPages.sortOrder), asc(siloPages.id)),
    db.select().from(silos).orderBy(asc(silos.pageId), asc(silos.sortOrder), asc(silos.id)),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Setup</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure dashboard pages and the silos on each, including where the
            Modbus-TCP worker (scripts/silo-worker.ts) reads their level from.
          </p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Dashboard
        </Link>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Pages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <form action={createSiloPageAction} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="page-name">New page name</Label>
              <Input id="page-name" name="name" placeholder="e.g. North Yard" required />
            </div>
            <Button type="submit">Add page</Button>
          </form>

          <div className="space-y-2">
            {pages.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">No pages yet.</p>
            )}
            {pages.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
              >
                <span>
                  {p.name} <span className="text-slate-400">/{p.slug}</span>
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <Link
                    href={`/admin/pages/${p.id}`}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    Edit
                  </Link>
                  <form action={deleteSiloPageAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a silo</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <form action={createSiloAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pageId">Page</Label>
                <Select id="pageId" name="pageId" required disabled={pages.length === 0}>
                  {pages.length === 0 && <option value="">Add a page first</option>}
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Silo name</Label>
                <Input id="name" name="name" placeholder="e.g. Silo 3 — Wheat" required />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="host">Modbus host / IP</Label>
                <Input id="host" name="host" placeholder="192.168.1.50" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="port">Port</Label>
                <Input id="port" name="port" type="number" defaultValue={502} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unitId">Unit ID</Label>
                <Input id="unitId" name="unitId" type="number" defaultValue={1} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="registerAddress">Register address</Label>
                <Input id="registerAddress" name="registerAddress" type="number" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dataType">Data type</Label>
                <Select id="dataType" name="dataType" defaultValue="UINT16">
                  {DATA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scale">Scale factor</Label>
                <Input id="scale" name="scale" type="number" step="any" defaultValue={1} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="capacity">Capacity</Label>
                <Input id="capacity" name="capacity" type="number" step="any" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" name="unit" placeholder="t" defaultValue="t" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="lowAlarmPercent">Low alarm (% of capacity, optional)</Label>
                <Input id="lowAlarmPercent" name="lowAlarmPercent" type="number" min={0} max={100} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="highAlarmPercent">High alarm (% of capacity, optional)</Label>
                <Input id="highAlarmPercent" name="highAlarmPercent" type="number" min={0} max={100} />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={pages.length === 0}>
              Add silo
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All silos ({allSilos.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-4">
          {allSilos.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">No silos configured yet.</p>
          )}
          {allSilos.map((s) => {
            const page = pages.find((p) => p.id === s.pageId);
            return (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
              >
                <div>
                  <span className="font-medium">{s.name}</span>{" "}
                  <span className="text-slate-400">
                    · {page?.name ?? "unknown page"} · {s.host}:{s.port} unit {s.unitId} reg {s.registerAddress}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link
                    href={`/admin/${s.id}`}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    Edit
                  </Link>
                  <form action={deleteSiloAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button
                      type="submit"
                      className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

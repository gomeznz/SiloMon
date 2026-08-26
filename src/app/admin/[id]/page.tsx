import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { silos, siloPages } from "@/db/schema";
import { updateSiloAction } from "../../actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

const DATA_TYPES = ["UINT16", "INT16", "UINT32", "INT32", "FLOAT32"] as const;

// Reads live DB state on every request — must not be statically prerendered
// at build time (the DB isn't reachable from the build environment anyway).
export const dynamic = "force-dynamic";

export default async function EditSiloPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const siloId = Number(id);

  const [[silo], pages] = await Promise.all([
    db.select().from(silos).where(eq(silos.id, siloId)).limit(1),
    db.select().from(siloPages).orderBy(asc(siloPages.sortOrder), asc(siloPages.id)),
  ]);

  if (!silo) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Edit silo</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{silo.name}</p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Dashboard
        </Link>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Card>
        <CardContent className="pt-4">
          <form action={updateSiloAction} className="space-y-4">
            <input type="hidden" name="id" value={silo.id} />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pageId">Page</Label>
                <Select id="pageId" name="pageId" required defaultValue={silo.pageId}>
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Silo name</Label>
                <Input id="name" name="name" defaultValue={silo.name} required />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="host">Modbus host / IP</Label>
                <Input id="host" name="host" defaultValue={silo.host} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="port">Port</Label>
                <Input id="port" name="port" type="number" defaultValue={silo.port} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unitId">Unit ID</Label>
                <Input id="unitId" name="unitId" type="number" defaultValue={silo.unitId} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="registerAddress">Register address</Label>
                <Input
                  id="registerAddress"
                  name="registerAddress"
                  type="number"
                  defaultValue={silo.registerAddress}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dataType">Data type</Label>
                <Select id="dataType" name="dataType" defaultValue={silo.dataType}>
                  {DATA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scale">Scale factor</Label>
                <Input id="scale" name="scale" type="number" step="any" defaultValue={Number(silo.scale)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="capacity">Capacity</Label>
                <Input
                  id="capacity"
                  name="capacity"
                  type="number"
                  step="any"
                  defaultValue={Number(silo.capacity)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" name="unit" defaultValue={silo.unit} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="lowAlarmPercent">Low alarm (% of capacity, optional)</Label>
                <Input
                  id="lowAlarmPercent"
                  name="lowAlarmPercent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={silo.lowAlarmPercent !== null ? Number(silo.lowAlarmPercent) * 100 : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="highAlarmPercent">High alarm (% of capacity, optional)</Label>
                <Input
                  id="highAlarmPercent"
                  name="highAlarmPercent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={silo.highAlarmPercent !== null ? Number(silo.highAlarmPercent) * 100 : undefined}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                Save changes
              </Button>
              <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

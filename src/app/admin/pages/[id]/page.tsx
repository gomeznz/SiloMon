import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { siloPages } from "@/db/schema";
import { updateSiloPageAction } from "../../../actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

// Reads live DB state on every request — must not be statically prerendered
// at build time (the DB isn't reachable from the build environment anyway).
export const dynamic = "force-dynamic";

export default async function EditSiloPagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const pageId = Number(id);

  const [page] = await db.select().from(siloPages).where(eq(siloPages.id, pageId)).limit(1);

  if (!page) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Edit page</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">/{page.slug}</p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Dashboard
        </Link>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Card>
        <CardContent className="pt-4">
          <form action={updateSiloPageAction} className="space-y-4">
            <input type="hidden" name="id" value={page.id} />

            <div className="space-y-1.5">
              <Label htmlFor="name">Page name</Label>
              <Input id="name" name="name" defaultValue={page.name} required />
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Renaming changes this page&apos;s URL (currently /{page.slug}).
              </p>
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { siloPages } from "@/db/schema";
import { buttonVariants } from "@/components/ui/button";

export default async function HomePage() {
  const [firstPage] = await db
    .select({ slug: siloPages.slug })
    .from(siloPages)
    .orderBy(asc(siloPages.sortOrder), asc(siloPages.id))
    .limit(1);

  if (firstPage) {
    redirect(`/${firstPage.slug}`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-8">
      <div>
        <h1 className="text-2xl font-semibold">SiloMon</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No silo pages have been configured yet.
        </p>
      </div>
      <Link href="/admin" className={buttonVariants({})}>
        Set up silos
      </Link>
    </div>
  );
}

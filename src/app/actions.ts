"use server";

// No authentication exists in this app yet — anyone who can reach it can
// add/delete pages and silos, including the Modbus gateway host/port they
// point at. Fine for local/internal testing; add an auth check here before
// this is reachable from anywhere untrusted.

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { silos, siloPages } from "@/db/schema";

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CreateSiloPageSchema = z.object({
  name: z.string().trim().min(1, "Enter a page name"),
});

export async function createSiloPageAction(formData: FormData) {
  const parsed = CreateSiloPageSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    redirectWithError("/admin", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const slug = slugify(parsed.data.name);
  if (!slug) {
    redirectWithError("/admin", "Enter a page name");
  }

  const existing = await db.select({ id: siloPages.id }).from(siloPages).where(eq(siloPages.slug, slug));
  if (existing.length > 0) {
    redirectWithError("/admin", "A page with that name already exists");
  }

  await db.insert(siloPages).values({ name: parsed.data.name, slug });

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

export async function deleteSiloPageAction(formData: FormData) {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse({
    id: formData.get("id"),
  });

  await db.delete(siloPages).where(eq(siloPages.id, id));

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

const CreateSiloSchema = z.object({
  pageId: z.coerce.number().int().positive("Choose a page"),
  name: z.string().trim().min(1, "Enter a silo name"),
  host: z.string().trim().min(1, "Enter the Modbus gateway host/IP"),
  port: z.coerce.number().int().min(1).max(65535).default(502),
  unitId: z.coerce.number().int().min(0).max(255).default(1),
  registerAddress: z.coerce.number().int().min(0),
  dataType: z.enum(["UINT16", "INT16", "UINT32", "INT32", "FLOAT32"]),
  scale: z.coerce.number().default(1),
  capacity: z.coerce.number().positive("Enter the silo's capacity"),
  unit: z.string().trim().min(1).default("t"),
  lowAlarmPercent: z.coerce.number().min(0).max(100).optional(),
  highAlarmPercent: z.coerce.number().min(0).max(100).optional(),
});

export async function createSiloAction(formData: FormData) {
  const parsed = CreateSiloSchema.safeParse({
    pageId: formData.get("pageId"),
    name: formData.get("name"),
    host: formData.get("host"),
    port: formData.get("port") || undefined,
    unitId: formData.get("unitId") || undefined,
    registerAddress: formData.get("registerAddress"),
    dataType: formData.get("dataType"),
    scale: formData.get("scale") || undefined,
    capacity: formData.get("capacity"),
    unit: formData.get("unit") || undefined,
    lowAlarmPercent: formData.get("lowAlarmPercent") || undefined,
    highAlarmPercent: formData.get("highAlarmPercent") || undefined,
  });

  if (!parsed.success) {
    redirectWithError("/admin", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const {
    pageId,
    name,
    host,
    port,
    unitId,
    registerAddress,
    dataType,
    scale,
    capacity,
    unit,
    lowAlarmPercent,
    highAlarmPercent,
  } = parsed.data;

  await db.insert(silos).values({
    pageId,
    name,
    host,
    port,
    unitId,
    registerAddress,
    dataType,
    scale: scale.toFixed(4),
    capacity: capacity.toFixed(2),
    unit,
    lowAlarmPercent: lowAlarmPercent !== undefined ? (lowAlarmPercent / 100).toFixed(3) : null,
    highAlarmPercent: highAlarmPercent !== undefined ? (highAlarmPercent / 100).toFixed(3) : null,
  });

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

export async function deleteSiloAction(formData: FormData) {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse({
    id: formData.get("id"),
  });

  await db.delete(silos).where(eq(silos.id, id));

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

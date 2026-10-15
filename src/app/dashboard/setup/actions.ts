"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, organizationMembers, organizations } from "@/db/schema";
import { requireUser } from "@/lib/auth";

const schema = z.object({ name: z.string().trim().min(2).max(100) });

export async function createOrganization(formData: FormData) {
  const parsed = schema.safeParse({ name: formData.get("name") });
  if (!parsed.success) throw new Error("Organization name must be between 2 and 100 characters");
  const user = await requireUser();
  const base = parsed.data.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "organization";
  const slug = `${base}-${crypto.randomBytes(3).toString("hex")}`;
  const [org] = await db.insert(organizations).values({ ownerUserId: user.id, name: parsed.data.name, slug }).returning();
  await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: "owner" }).onConflictDoNothing();
  await db.insert(auditLogs).values({ organizationId: org.id, actorUserId: user.id, action: "organization.created", entityType: "organization", entityId: org.id });
  redirect(`/dashboard/competitions/new?organizationId=${org.id}`);
}

import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizationMembers, organizations, users } from "@/db/schema";

export async function requireUser() {
  const { userId } = await auth.protect();

  const existing = await db.query.users.findFirst({ where: eq(users.clerkUserId, userId) });
  if (existing) return existing;

  const clerk = await currentUser();
  const email = clerk?.primaryEmailAddress?.emailAddress ?? null;
  const displayName = clerk ? [clerk.firstName, clerk.lastName].filter(Boolean).join(" ") || clerk.username || null : null;
  const [created] = await db.insert(users).values({ clerkUserId: userId, email, displayName, imageUrl: clerk?.imageUrl ?? null }).onConflictDoUpdate({
    target: users.clerkUserId,
    set: { email, displayName, imageUrl: clerk?.imageUrl ?? null, updatedAt: new Date() },
  }).returning();
  return created;
}

const roleRank = { viewer: 0, scorer: 1, admin: 2, owner: 3 } as const;
type Role = keyof typeof roleRank;

export async function requireOrgRole(organizationId: string, minimum: Role) {
  const user = await requireUser();
  const membership = await db.query.organizationMembers.findFirst({
    where: and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, user.id)),
  });
  let role: Role | null = membership?.role ?? null;
  if (!role) {
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) });
    if (org?.ownerUserId === user.id) role = "owner";
  }
  if (!role || roleRank[role] < roleRank[minimum]) throw new Error("FORBIDDEN");
  return { user, role };
}

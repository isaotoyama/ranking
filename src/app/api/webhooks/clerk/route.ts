import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function POST(request: NextRequest) {
  try {
    const evt = await verifyWebhook(request);
    if (evt.type === "user.created" || evt.type === "user.updated") {
      const data = evt.data;
      const primary = data.email_addresses?.find((e) => e.id === data.primary_email_address_id)?.email_address ?? null;
      const displayName = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.username || null;
      const clerkUpdatedAt = data.updated_at ?? data.created_at ?? Date.now();
      const state = { email: primary, displayName, imageUrl: data.image_url ?? null, clerkUpdatedAt, updatedAt: new Date() };
      const [inserted] = await db.insert(users).values({ clerkUserId: data.id, ...state }).onConflictDoNothing().returning({ id: users.id });
      if (!inserted) {
        await db.update(users).set(state).where(and(eq(users.clerkUserId, data.id), lte(users.clerkUpdatedAt, clerkUpdatedAt)));
      }
    }
    if (evt.type === "user.deleted" && evt.data.id) {
      // Preserve referential history; clear mutable PII when Clerk deletes the account.
      await db.update(users).set({ email: null, displayName: "Deleted user", imageUrl: null, updatedAt: new Date() }).where(eq(users.clerkUserId, evt.data.id));
    }
    return new Response("ok");
  } catch {
    return new Response("invalid webhook", { status: 400 });
  }
}

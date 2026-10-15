import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { requireOrgRole } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

import { mutationErrorStatus, requireTrustedMutationRequest } from "@/lib/request-security";
const allowed = new Set([process.env.STRIPE_PRICE_ORGANIZER, process.env.STRIPE_PRICE_LEAGUE, process.env.STRIPE_PRICE_DATA].filter(Boolean));

export async function POST(request: Request) {
  try { requireTrustedMutationRequest(request); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "BAD_REQUEST" }, { status: mutationErrorStatus(error) }); }
  const { organizationId, priceId } = await request.json();
  if (typeof organizationId !== "string" || typeof priceId !== "string" || !allowed.has(priceId)) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { user } = await requireOrgRole(organizationId, "owner");
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) });
  if (!org) return Response.json({ error: "Not found" }, { status: 404 });

  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe().customers.create({ name: org.name, metadata: { organizationId: org.id } }, { idempotencyKey: `org-customer-${org.id}` });
    customerId = customer.id;
    await db.update(organizations).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(eq(organizations.id, org.id));
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/dashboard?billing=success`,
    cancel_url: `${base}/dashboard?billing=cancelled`,
    client_reference_id: org.id,
    metadata: { organizationId: org.id, actorUserId: user.id },
    subscription_data: { metadata: { organizationId: org.id } },
  });
  return Response.json({ url: session.url });
}

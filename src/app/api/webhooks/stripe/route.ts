import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { organizations, subscriptions, webhookEvents } from "@/db/schema";
import { planFromPrice, stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) return new Response("Stripe webhook not configured", { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const body = await request.text();

  let event;
  try { event = stripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return new Response("Invalid signature", { status: 400 }); }

  const seen = await db.query.webhookEvents.findFirst({ where: (t, { and, eq }) => and(eq(t.provider, "stripe"), eq(t.eventId, event.id)) });
  if (seen) return new Response("already processed");

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const org = await db.query.organizations.findFirst({ where: eq(organizations.stripeCustomerId, customerId) });
    if (org) {
      const priceId = sub.items.data[0]?.price.id ?? null;
      const periodEndSeconds = Math.max(0, ...sub.items.data.map((item) => item.current_period_end ?? 0));
      const subscriptionState = {
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        status: sub.status,
        currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null,
        lastStripeEventCreated: event.created,
        updatedAt: new Date(),
      };

      // Insert-or-conditionally-update makes webhook processing safe when Stripe retries
      // or delivers older subscription events after newer ones.
      const [inserted] = await db.insert(subscriptions).values({
        organizationId: org.id,
        stripeCustomerId: customerId,
        ...subscriptionState,
      }).onConflictDoNothing().returning({ organizationId: subscriptions.organizationId });

      let accepted = Boolean(inserted);
      if (!inserted) {
        const [updated] = await db.update(subscriptions).set(subscriptionState).where(and(
          eq(subscriptions.organizationId, org.id),
          lte(subscriptions.lastStripeEventCreated, event.created),
        )).returning({ organizationId: subscriptions.organizationId });
        accepted = Boolean(updated);
      }

      if (accepted) {
        const active = ["active", "trialing"].includes(sub.status);
        await db.update(organizations).set({ plan: active ? planFromPrice(priceId) : "free", updatedAt: new Date() }).where(eq(organizations.id, org.id));
      }
    }
  }

  await db.insert(webhookEvents).values({ provider: "stripe", eventId: event.id }).onConflictDoNothing();
  return new Response("ok");
}

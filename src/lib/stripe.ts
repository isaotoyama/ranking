import "server-only";
import Stripe from "stripe";

let instance: Stripe | null = null;
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured");
  instance ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return instance;
}

export function planFromPrice(priceId: string | null | undefined) {
  if (!priceId) return "free" as const;
  if (priceId === process.env.STRIPE_PRICE_ORGANIZER) return "organizer" as const;
  if (priceId === process.env.STRIPE_PRICE_LEAGUE) return "league" as const;
  if (priceId === process.env.STRIPE_PRICE_DATA) return "data" as const;
  return "free" as const;
}

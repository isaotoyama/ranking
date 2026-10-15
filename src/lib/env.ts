import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRICE_ORGANIZER: z.string().min(1).optional(),
  STRIPE_PRICE_LEAGUE: z.string().min(1).optional(),
  STRIPE_PRICE_DATA: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(24).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export function env() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Invalid server environment: ${parsed.error.message}`);
  return parsed.data;
}

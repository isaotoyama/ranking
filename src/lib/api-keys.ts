import "server-only";
import crypto from "node:crypto";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, apiUsageDaily, apiUsageMonthly, organizations } from "@/db/schema";

const PREFIX = "rk_live_";

export function createRawApiKey() {
  return PREFIX + crypto.randomBytes(32).toString("base64url");
}

export function hashApiKey(raw: string) {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function authenticateApiKey(raw: string | null) {
  if (!raw?.startsWith(PREFIX)) return null;
  const hash = hashApiKey(raw);
  const key = await db.query.apiKeys.findFirst({ where: and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)) });
  if (!key) return null;
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, key.organizationId) });
  if (!org) return null;
  return { key, org };
}

const monthlyQuota = { free: 1000, organizer: 25000, league: 250000, data: 1_000_000, enterprise: Number.MAX_SAFE_INTEGER } as const;
export const scopeUnitCost = { competition: 1, series: 2, season: 2, year: 2, all_time: 5 } as const;
const allowedScopes = {
  free: new Set(["competition"]),
  organizer: new Set(["competition", "year"]),
  league: new Set(["competition", "series", "season", "year"]),
  data: new Set(["competition", "series", "season", "year", "all_time"]),
  enterprise: new Set(["competition", "series", "season", "year", "all_time"]),
} as const;

export function assertApiScope(authz: NonNullable<Awaited<ReturnType<typeof authenticateApiKey>>>, scope: keyof typeof scopeUnitCost) {
  if (!(allowedScopes[authz.org.plan] as ReadonlySet<string>).has(scope)) throw new Error("SCOPE_NOT_INCLUDED");
}

export async function consumeUsage(apiKeyId: string, organizationId: string, plan: keyof typeof monthlyQuota, scope: keyof typeof scopeUnitCost) {
  const units = scopeUnitCost[scope];
  const quota = monthlyQuota[plan];
  if (units > quota) throw new Error("MONTHLY_QUOTA_EXCEEDED");
  const today = new Date().toISOString().slice(0, 10);
  const month = `${today.slice(0, 7)}-01`;

  const [inserted] = await db.insert(apiUsageMonthly).values({ organizationId, usageMonth: month, requestCount: 1, billableUnits: units }).onConflictDoNothing().returning({ organizationId: apiUsageMonthly.organizationId });
  if (!inserted) {
    const [updated] = await db.update(apiUsageMonthly).set({
      requestCount: sql`${apiUsageMonthly.requestCount} + 1`,
      billableUnits: sql`${apiUsageMonthly.billableUnits} + ${units}`,
      updatedAt: new Date(),
    }).where(and(eq(apiUsageMonthly.organizationId, organizationId), eq(apiUsageMonthly.usageMonth, month), lte(sql`${apiUsageMonthly.billableUnits} + ${units}`, quota))).returning({ organizationId: apiUsageMonthly.organizationId });
    if (!updated) throw new Error("MONTHLY_QUOTA_EXCEEDED");
  }

  await db.insert(apiUsageDaily).values({ apiKeyId, organizationId, usageDate: today, requestCount: 1, billableUnits: units }).onConflictDoUpdate({
    target: [apiUsageDaily.apiKeyId, apiUsageDaily.usageDate],
    set: { requestCount: sql`${apiUsageDaily.requestCount} + 1`, billableUnits: sql`${apiUsageDaily.billableUnits} + ${units}`, updatedAt: new Date() },
  });
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKeyId));
}

export function quotaFor(plan: keyof typeof monthlyQuota) { return monthlyQuota[plan]; }

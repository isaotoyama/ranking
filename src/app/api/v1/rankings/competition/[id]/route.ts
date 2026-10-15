import { eq } from "drizzle-orm";
import { db } from "@/db";
import { competitions, players, rankingEntries } from "@/db/schema";
import { assertApiScope, authenticateApiKey, consumeUsage } from "@/lib/api-keys";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authenticateApiKey(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null);
  if (!authz) return Response.json({ error: "Invalid API key" }, { status: 401 });
  const { id } = await params;
  const competition = await db.query.competitions.findFirst({ where: eq(competitions.id, id) });
  if (competition && competition.visibility === "private" && competition.organizationId !== authz.org.id) return Response.json({ error: "Not found" }, { status: 404 });
  if (!competition?.publishedRankingRunId) return Response.json({ error: "Ranking not published" }, { status: 404 });

  try { assertApiScope(authz, "competition"); } catch (error) {
    const code = error instanceof Error ? error.message : "FORBIDDEN";
    return Response.json({ error: code }, { status: code === "MONTHLY_QUOTA_EXCEEDED" ? 429 : 403 });
  }

  const rows = await db.select({ rank: rankingEntries.rank, value: rankingEntries.value, breakdown: rankingEntries.breakdown, playerId: players.id, playerName: players.displayName, playerSlug: players.slug }).from(rankingEntries).innerJoin(players, eq(players.id, rankingEntries.playerId)).where(eq(rankingEntries.rankingRunId, competition.publishedRankingRunId)).orderBy(rankingEntries.rank);
  try { await consumeUsage(authz.key.id, authz.org.id, authz.org.plan, "competition"); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "USAGE_ERROR" }, { status: 429 }); }
  return Response.json({ competition: { id: competition.id, name: competition.name, metric: competition.metric, aggregation: competition.aggregation, direction: competition.direction, unit: competition.unit }, entries: rows });
}

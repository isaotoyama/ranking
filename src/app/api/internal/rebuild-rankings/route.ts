import { eq } from "drizzle-orm";
import { db } from "@/db";
import { competitions, rankingDefinitions } from "@/db/schema";
import { rebuildCompetitionRanking } from "@/lib/rebuild-ranking";
import { rebuildScopedRanking } from "@/lib/rebuild-scoped-ranking";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  const active = await db.select({ id: competitions.id }).from(competitions).where(eq(competitions.status, "running"));
  const competitionRuns: string[] = [];
  for (const c of active.slice(0, 50)) competitionRuns.push(await rebuildCompetitionRanking(c.id));

  const definitions = await db.select({ id: rankingDefinitions.id }).from(rankingDefinitions);
  const scopedRuns: string[] = [];
  for (const d of definitions.slice(0, 100)) scopedRuns.push(await rebuildScopedRanking(d.id));

  return Response.json({ competitionsRebuilt: competitionRuns.length, scopedRankingsRebuilt: scopedRuns.length, competitionRuns, scopedRuns });
}

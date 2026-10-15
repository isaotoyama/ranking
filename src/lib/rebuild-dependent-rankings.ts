import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { competitions, rankingDefinitions, seasons } from "@/db/schema";
import { rebuildScopedRanking } from "@/lib/rebuild-scoped-ranking";

export async function rebuildDependentRankings(competitionId: string) {
  const competition = await db.query.competitions.findFirst({ where: eq(competitions.id, competitionId) });
  if (!competition) return [] as string[];
  const definitions = await db.select().from(rankingDefinitions).where(eq(rankingDefinitions.organizationId, competition.organizationId));
  let seriesId: string | null = null;
  if (competition.seasonId) {
    const season = await db.query.seasons.findFirst({ where: eq(seasons.id, competition.seasonId) });
    seriesId = season?.seriesId ?? null;
  }
  const year = competition.startsAt?.getUTCFullYear().toString() ?? null;
  const affected = definitions.filter((d) => {
    if (d.scope === "all_time") return true;
    if (d.scope === "year") return year !== null && d.scopeKey === year;
    if (d.scope === "season") return competition.seasonId !== null && d.scopeKey === competition.seasonId;
    if (d.scope === "series") return seriesId !== null && d.scopeKey === seriesId;
    return false;
  });
  const runs: string[] = [];
  for (const definition of affected.slice(0, 8)) runs.push(await rebuildScopedRanking(definition.id));
  return runs;
}

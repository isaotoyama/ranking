import "server-only";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { competitions, rankingDefinitions, rankingEntries, rankingRuns, seasons } from "@/db/schema";
import { calculateScopePoints, rankPlayers } from "@/lib/ranking-engine";

const defaultPoints: Record<string, number> = { "1":25,"2":18,"3":15,"4":12,"5":10,"6":8,"7":6,"8":4,"9":2,"10":1 };

export async function rebuildScopedRanking(definitionId: string) {
  const definition = await db.query.rankingDefinitions.findFirst({ where: eq(rankingDefinitions.id, definitionId) });
  if (!definition || definition.scope === "competition") throw new Error("Scoped ranking definition not found");
  const [claim] = await db.update(rankingDefinitions).set({ rankingGeneration: sql`${rankingDefinitions.rankingGeneration} + 1`, updatedAt: new Date() }).where(eq(rankingDefinitions.id, definitionId)).returning({ generation: rankingDefinitions.rankingGeneration });
  if (!claim) throw new Error("Ranking definition not found");
  const [run] = await db.insert(rankingRuns).values({ scope: definition.scope, scopeKey: definition.scopeKey, definitionId, generation: claim.generation }).returning();

  try {
    let compRows: Array<{id:string;publishedRankingRunId:string|null}> = [];
    if (definition.scope === "season") {
      compRows = await db.select({ id: competitions.id, publishedRankingRunId: competitions.publishedRankingRunId }).from(competitions).where(and(eq(competitions.organizationId, definition.organizationId), eq(competitions.seasonId, definition.scopeKey)));
    } else if (definition.scope === "series") {
      const seasonRows = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.seriesId, definition.scopeKey));
      const seasonIds = seasonRows.map((x)=>x.id);
      compRows = seasonIds.length ? await db.select({ id: competitions.id, publishedRankingRunId: competitions.publishedRankingRunId }).from(competitions).where(and(eq(competitions.organizationId, definition.organizationId), inArray(competitions.seasonId, seasonIds))) : [];
    } else if (definition.scope === "year") {
      const year = Number(definition.scopeKey);
      if (!Number.isInteger(year) || year < 1900 || year > 3000) throw new Error("Invalid year scopeKey");
      const start = new Date(Date.UTC(year,0,1));
      const end = new Date(Date.UTC(year+1,0,1));
      compRows = await db.select({ id: competitions.id, publishedRankingRunId: competitions.publishedRankingRunId }).from(competitions).where(and(eq(competitions.organizationId, definition.organizationId), gte(competitions.startsAt,start), lt(competitions.startsAt,end)));
    } else {
      compRows = await db.select({ id: competitions.id, publishedRankingRunId: competitions.publishedRankingRunId }).from(competitions).where(eq(competitions.organizationId, definition.organizationId));
    }

    const published = compRows.filter((c): c is {id:string;publishedRankingRunId:string} => Boolean(c.publishedRankingRunId));
    const runIds = published.map((c)=>c.publishedRankingRunId);
    const sourceEntries = runIds.length ? await db.select().from(rankingEntries).where(inArray(rankingEntries.rankingRunId, runIds)) : [];
    const competitionByRun = new Map(published.map((c)=>[c.publishedRankingRunId,c.id]));
    const table = Object.keys(definition.config.positionPoints ?? {}).length ? definition.config.positionPoints : defaultPoints;
    const dropLowest = Math.max(0, definition.config.dropLowest ?? 0);
    const minCompetitions = Math.max(0, definition.config.minCompetitions ?? 0);
    const byPlayer = new Map<string, Array<{competitionId:string;rank:number;points:number;counted:boolean}>>();
    for (const entry of sourceEntries) {
      const competitionId = competitionByRun.get(entry.rankingRunId);
      if (!competitionId) continue;
      const points = table[String(entry.rank)] ?? 0;
      byPlayer.set(entry.playerId,[...(byPlayer.get(entry.playerId)??[]),{competitionId,rank:entry.rank,points,counted:true}]);
    }

    const breakdownByPlayer = new Map<string, Array<{competitionId:string;rank:number;points:number;counted:boolean}>>();
    const calculations = [];
    for (const [playerId, items] of byPlayer) {
      const scopeCalc = calculateScopePoints(items, dropLowest, minCompetitions);
      if (!scopeCalc) continue;
      breakdownByPlayer.set(playerId, scopeCalc.competitions.map((x) => ({ ...x, counted: Boolean(x.counted) })));
      calculations.push({playerId,value:scopeCalc.value,rounds:[]});
    }
    const ranked=rankPlayers(calculations,definition.direction);
    if(ranked.length) await db.insert(rankingEntries).values(ranked.map((r)=>({rankingRunId:run.id,playerId:r.playerId,rank:r.rank,value:r.value,breakdown:{kind:"scope" as const,competitions:breakdownByPlayer.get(r.playerId)??[],dropLowest}})));

    const [pointer]=await db.update(rankingDefinitions).set({publishedRankingRunId:run.id,updatedAt:new Date()}).where(and(eq(rankingDefinitions.id,definitionId),eq(rankingDefinitions.rankingGeneration,claim.generation))).returning({id:rankingDefinitions.id});
    if(pointer) await db.update(rankingRuns).set({status:"published",publishedAt:new Date()}).where(eq(rankingRuns.id,run.id));
    else await db.update(rankingRuns).set({status:"superseded"}).where(eq(rankingRuns.id,run.id));
    return run.id;
  } catch(error) {
    await db.update(rankingRuns).set({status:"failed",error:error instanceof Error?error.message.slice(0,2000):"Unknown error"}).where(eq(rankingRuns.id,run.id));
    throw error;
  }
}

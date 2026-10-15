import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { competitions, rankingEntries, rankingRuns, resultAdjustments, results, rounds } from "@/db/schema";
import { aggregateAttempts, calculatePlayer, rankPlayers } from "@/lib/ranking-engine";

export async function rebuildCompetitionRanking(competitionId: string) {
  const competition = await db.query.competitions.findFirst({ where: eq(competitions.id, competitionId) });
  if (!competition) throw new Error("Competition not found");

  const [claim] = await db.update(competitions).set({ rankingGeneration: sql`${competitions.rankingGeneration} + 1` }).where(eq(competitions.id, competitionId)).returning({ generation: competitions.rankingGeneration });
  if (!claim) throw new Error("Competition not found");
  const [run] = await db.insert(rankingRuns).values({ scope: "competition", scopeKey: competitionId, competitionId, generation: claim.generation }).returning();

  try {
    const roundRows = await db.select().from(rounds).where(eq(rounds.competitionId, competitionId));
    const roundById = new Map(roundRows.map((r) => [r.id, r]));
    const raw = await db.select().from(results).where(eq(results.competitionId, competitionId));
    const ids = raw.map((r) => r.id);
    const adjustments = ids.length ? await db.select().from(resultAdjustments).where(inArray(resultAdjustments.resultId, ids)) : [];
    const adjustmentByResult = new Map<string, number>();
    for (const a of adjustments) adjustmentByResult.set(a.resultId, (adjustmentByResult.get(a.resultId) ?? 0) + a.delta);

    const byPlayer = new Map<string, typeof raw>();
    for (const r of raw) byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r]);

    const calculations = [];
    for (const [playerId, playerResults] of byPlayer) {
      const attemptMode = competition.settings.attemptAggregation ?? (competition.direction === "asc" ? "min" : "max");
      const attemptsByRound = new Map<string, typeof playerResults>();
      for (const r of playerResults) attemptsByRound.set(r.roundId, [...(attemptsByRound.get(r.roundId) ?? []), r]);

      const values = [];
      for (const [roundId, attempts] of attemptsByRound) {
        const round = roundById.get(roundId);
        if (!round) continue;
        const eligible = attempts
          .filter((r) => r.status === "valid" && r.rawValue != null)
          .map((r) => ({ ...r, adjusted: r.rawValue! + (adjustmentByResult.get(r.id) ?? 0) }));
        if (!eligible.length) continue;
        const selected = aggregateAttempts(eligible.map((r) => ({ value: r.rawValue!, adjustment: adjustmentByResult.get(r.id) ?? 0, attemptNumber: r.attemptNumber, recordedAt: r.recordedAt })), attemptMode);
        if (selected == null) continue;
        values.push({ roundId, roundNumber: round.roundNumber, value: selected, adjustment: 0, status: "valid" as const, weight: round.weight });
      }
      const calc = calculatePlayer(playerId, values, {
        aggregation: competition.aggregation,
        direction: competition.direction,
        bestN: competition.settings.bestN,
        positionPoints: competition.settings.positionPoints,
      });
      if (calc) calculations.push(calc);
    }

    const ranked = rankPlayers(calculations, competition.direction);
    if (ranked.length) {
      await db.insert(rankingEntries).values(ranked.map((r) => ({
        rankingRunId: run.id,
        playerId: r.playerId,
        rank: r.rank,
        value: r.value,
        breakdown: {
          kind: "competition" as const,
          aggregation: competition.aggregation,
          direction: competition.direction,
          rounds: r.rounds.map((x) => ({ roundId: x.roundId, roundNumber: x.roundNumber, value: x.value, adjustedValue: x.adjustedValue, counted: x.counted })),
        },
      })));
    }

    // Publish pointer last. Readers either see the old complete run or the new complete run.
    const [pointer] = await db.update(competitions).set({ publishedRankingRunId: run.id, updatedAt: new Date() }).where(and(eq(competitions.id, competitionId), eq(competitions.rankingGeneration, claim.generation))).returning({ id: competitions.id });
    if (pointer) await db.update(rankingRuns).set({ status: "published", publishedAt: new Date() }).where(eq(rankingRuns.id, run.id));
    else await db.update(rankingRuns).set({ status: "superseded" }).where(eq(rankingRuns.id, run.id));
    return run.id;
  } catch (error) {
    await db.update(rankingRuns).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 2000) : "Unknown error" }).where(eq(rankingRuns.id, run.id));
    throw error;
  }
}

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, competitionParticipants, competitions, results, rounds } from "@/db/schema";
import { requireOrgRole } from "@/lib/auth";
import { rebuildCompetitionRanking } from "@/lib/rebuild-ranking";
import { rebuildDependentRankings } from "@/lib/rebuild-dependent-rankings";

import { mutationErrorStatus, requireTrustedMutationRequest } from "@/lib/request-security";
const bodySchema = z.object({
  competitionId: z.string().uuid(),
  roundId: z.string().uuid(),
  playerId: z.string().uuid(),
  rawValue: z.number().finite().nullable(),
  status: z.enum(["valid", "dns", "dnf", "dsq", "void"]).default("valid"),
  attemptNumber: z.number().int().positive().max(1000).default(1),
  submissionKey: z.string().min(8).max(120),
}).superRefine((value, ctx) => {
  if (value.status === "valid" && value.rawValue == null) ctx.addIssue({ code: "custom", path: ["rawValue"], message: "A valid result requires a numeric value" });
});

export async function POST(request: Request) {
  try { requireTrustedMutationRequest(request); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "BAD_REQUEST" }, { status: mutationErrorStatus(error) }); }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const competition = await db.query.competitions.findFirst({ where: eq(competitions.id, input.competitionId) });
  if (!competition) return Response.json({ error: "Competition not found" }, { status: 404 });
  if (input.status === "valid" && competition.metric === "time" && input.rawValue! < 0) return Response.json({ error: "Time cannot be negative" }, { status: 400 });
  if (input.status === "valid" && competition.metric === "position" && (!Number.isInteger(input.rawValue) || input.rawValue! < 1)) return Response.json({ error: "Position must be a positive integer" }, { status: 400 });
  const { user } = await requireOrgRole(competition.organizationId, "scorer");
  const round = await db.query.rounds.findFirst({ where: and(eq(rounds.id, input.roundId), eq(rounds.competitionId, competition.id)) });
  if (!round) return Response.json({ error: "Round does not belong to competition" }, { status: 400 });
  const participant = await db.query.competitionParticipants.findFirst({ where: and(eq(competitionParticipants.competitionId, competition.id), eq(competitionParticipants.playerId, input.playerId)) });
  if (!participant) return Response.json({ error: "Player is not registered for this competition" }, { status: 400 });

  const existingSubmission = await db.query.results.findFirst({ where: and(eq(results.competitionId, competition.id), eq(results.submissionKey, input.submissionKey)) });
  if (existingSubmission) return Response.json({ status: "duplicate_ignored", resultId: existingSubmission.id }, { status: 200 });
  const existingAttempt = await db.query.results.findFirst({ where: and(eq(results.competitionId, competition.id), eq(results.roundId, input.roundId), eq(results.playerId, input.playerId), eq(results.attemptNumber, input.attemptNumber)) });
  if (existingAttempt) return Response.json({ error: "Attempt number already exists for this player and round", resultId: existingAttempt.id }, { status: 409 });
  const [created] = await db.insert(results).values({ ...input, submittedByUserId: user.id }).onConflictDoNothing().returning();
  if (!created) {
    const duplicate = await db.query.results.findFirst({ where: and(eq(results.competitionId, competition.id), eq(results.submissionKey, input.submissionKey)) });
    if (duplicate) return Response.json({ status: "duplicate_ignored", resultId: duplicate.id }, { status: 200 });
    const conflictingAttempt = await db.query.results.findFirst({ where: and(eq(results.competitionId, competition.id), eq(results.roundId, input.roundId), eq(results.playerId, input.playerId), eq(results.attemptNumber, input.attemptNumber)) });
    return Response.json({ error: "Attempt number already exists for this player and round", resultId: conflictingAttempt?.id }, { status: 409 });
  }
  await db.insert(auditLogs).values({ organizationId: competition.organizationId, actorUserId: user.id, action: "result.recorded", entityType: "result", entityId: created.id, payload: { competitionId: competition.id, roundId: input.roundId, playerId: input.playerId, attemptNumber: input.attemptNumber } });
  const runId = await rebuildCompetitionRanking(competition.id);
  const dependentRankingRuns = await rebuildDependentRankings(competition.id);
  return Response.json({ resultId: created.id, rankingRunId: runId, dependentRankingRuns }, { status: 201 });
}

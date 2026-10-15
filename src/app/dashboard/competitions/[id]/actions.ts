"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  competitionParticipants,
  competitions,
  players,
  results,
  rounds,
} from "@/db/schema";
import { requireOrgRole } from "@/lib/auth";
import { rebuildDependentRankings } from "@/lib/rebuild-dependent-rankings";
import { rebuildCompetitionRanking } from "@/lib/rebuild-ranking";

const playerSchema = z.object({
  competitionId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(100),
  countryCode: z.string().trim().length(2).optional().or(z.literal("")),
});

const resultSchema = z.object({
  competitionId: z.string().uuid(),
  playerId: z.string().uuid(),
  roundId: z.string().uuid(),
  attemptNumber: z.coerce.number().int().min(1).max(1000),
  status: z.enum(["valid", "dns", "dnf", "dsq", "void"]),
  rawValueText: z.string().trim(),
});

function playerSlug(name: string) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "player";
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function registerPlayer(formData: FormData) {
  const parsed = playerSchema.safeParse({
    competitionId: formData.get("competitionId"),
    displayName: formData.get("displayName"),
    countryCode: formData.get("countryCode") ?? "",
  });
  if (!parsed.success) throw new Error("Invalid player information");

  const competition = await db.query.competitions.findFirst({ where: eq(competitions.id, parsed.data.competitionId) });
  if (!competition) throw new Error("Competition not found");
  const { user } = await requireOrgRole(competition.organizationId, "scorer");

  const [player] = await db.insert(players).values({
    displayName: parsed.data.displayName,
    slug: playerSlug(parsed.data.displayName),
    countryCode: parsed.data.countryCode ? parsed.data.countryCode.toUpperCase() : undefined,
  }).returning();
  if (!player) throw new Error("Could not create player");

  await db.insert(competitionParticipants).values({ competitionId: competition.id, playerId: player.id });
  await db.insert(auditLogs).values({
    organizationId: competition.organizationId,
    actorUserId: user.id,
    action: "player.registered",
    entityType: "player",
    entityId: player.id,
    payload: { competitionId: competition.id },
  });

  revalidatePath(`/dashboard/competitions/${competition.id}`);
}

export async function recordResult(formData: FormData) {
  const parsed = resultSchema.safeParse({
    competitionId: formData.get("competitionId"),
    playerId: formData.get("playerId"),
    roundId: formData.get("roundId"),
    attemptNumber: formData.get("attemptNumber"),
    status: formData.get("status"),
    rawValueText: formData.get("rawValue") ?? "",
  });
  if (!parsed.success) throw new Error("Invalid result information");

  const competition = await db.query.competitions.findFirst({ where: eq(competitions.id, parsed.data.competitionId) });
  if (!competition) throw new Error("Competition not found");
  const { user } = await requireOrgRole(competition.organizationId, "scorer");

  const round = await db.query.rounds.findFirst({
    where: and(eq(rounds.id, parsed.data.roundId), eq(rounds.competitionId, competition.id)),
  });
  if (!round) throw new Error("Round does not belong to this competition");

  const participant = await db.query.competitionParticipants.findFirst({
    where: and(
      eq(competitionParticipants.competitionId, competition.id),
      eq(competitionParticipants.playerId, parsed.data.playerId),
    ),
  });
  if (!participant) throw new Error("Player is not registered for this competition");

  let rawValue: number | null = null;
  if (parsed.data.status === "valid") {
    rawValue = Number(parsed.data.rawValueText);
    if (!Number.isFinite(rawValue)) throw new Error("A valid result requires a numeric value");
    if (competition.metric === "time" && rawValue < 0) throw new Error("Time cannot be negative");
    if (competition.metric === "position" && (!Number.isInteger(rawValue) || rawValue < 1)) {
      throw new Error("Position must be a positive integer");
    }
  }

  const submissionKey = `ui:${crypto.randomUUID()}`;
  const [created] = await db.insert(results).values({
    competitionId: competition.id,
    roundId: round.id,
    playerId: parsed.data.playerId,
    attemptNumber: parsed.data.attemptNumber,
    rawValue,
    status: parsed.data.status,
    submissionKey,
    submittedByUserId: user.id,
  }).returning();
  if (!created) throw new Error("Could not record result");

  await db.insert(auditLogs).values({
    organizationId: competition.organizationId,
    actorUserId: user.id,
    action: "result.recorded",
    entityType: "result",
    entityId: created.id,
    payload: {
      competitionId: competition.id,
      roundId: round.id,
      playerId: parsed.data.playerId,
      attemptNumber: parsed.data.attemptNumber,
      source: "dashboard",
    },
  });

  await rebuildCompetitionRanking(competition.id);
  await rebuildDependentRankings(competition.id);
  revalidatePath(`/dashboard/competitions/${competition.id}`);
}

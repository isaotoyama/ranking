import { z } from "zod";
import { db } from "@/db";
import { auditLogs, competitionParticipants, competitions, players } from "@/db/schema";
import { requireOrgRole } from "@/lib/auth";
import { eq } from "drizzle-orm";

import { mutationErrorStatus, requireTrustedMutationRequest } from "@/lib/request-security";
const schema = z.object({ organizationId:z.string().uuid(), competitionId:z.string().uuid(), displayName:z.string().trim().min(1).max(100), countryCode:z.string().trim().length(2).optional() });
export async function POST(request: Request) {
  try { requireTrustedMutationRequest(request); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "BAD_REQUEST" }, { status: mutationErrorStatus(error) }); }
  const parsed=schema.safeParse(await request.json());
  if(!parsed.success) return Response.json({error:parsed.error.flatten()},{status:400});
  const {organizationId,competitionId,displayName,countryCode}=parsed.data;
  const {user}=await requireOrgRole(organizationId,"scorer");
  const competition=await db.query.competitions.findFirst({where:eq(competitions.id,competitionId)});
  if(!competition || competition.organizationId!==organizationId) return Response.json({error:"Competition does not belong to organization"},{status:400});
  const slug=`${displayName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,50) || "player"}-${crypto.randomUUID().slice(0,8)}`;
  const [player]=await db.insert(players).values({displayName,slug,countryCode:countryCode?.toUpperCase()}).returning();
  await db.insert(competitionParticipants).values({competitionId,playerId:player.id}).onConflictDoNothing();
  await db.insert(auditLogs).values({organizationId,actorUserId:user.id,action:"player.registered",entityType:"player",entityId:player.id,payload:{competitionId}});
  return Response.json({player},{status:201});
}

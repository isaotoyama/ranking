import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, competitions, resultAdjustments, results } from "@/db/schema";
import { requireOrgRole } from "@/lib/auth";
import { rebuildCompetitionRanking } from "@/lib/rebuild-ranking";
import { rebuildDependentRankings } from "@/lib/rebuild-dependent-rankings";

import { mutationErrorStatus, requireTrustedMutationRequest } from "@/lib/request-security";
const schema=z.object({resultId:z.string().uuid(),delta:z.number().finite().min(-1e12).max(1e12),reason:z.string().trim().min(5).max(500)});
export async function POST(request:Request){
 try { requireTrustedMutationRequest(request); } catch(error) { return Response.json({error:error instanceof Error?error.message:"BAD_REQUEST"},{status:mutationErrorStatus(error)}); }
  const parsed=schema.safeParse(await request.json());
  if(!parsed.success) return Response.json({error:parsed.error.flatten()},{status:400});
  const result=await db.query.results.findFirst({where:eq(results.id,parsed.data.resultId)});
  if(!result) return Response.json({error:"Result not found"},{status:404});
  const competition=await db.query.competitions.findFirst({where:eq(competitions.id,result.competitionId)});
  if(!competition) return Response.json({error:"Competition not found"},{status:404});
  const {user}=await requireOrgRole(competition.organizationId,"admin");
  const [adjustment]=await db.insert(resultAdjustments).values({resultId:result.id,delta:parsed.data.delta,reason:parsed.data.reason,createdByUserId:user.id}).returning();
  await db.insert(auditLogs).values({organizationId:competition.organizationId,actorUserId:user.id,action:"result.adjusted",entityType:"result",entityId:result.id,payload:{adjustmentId:adjustment.id,delta:parsed.data.delta,reason:parsed.data.reason}});
  const rankingRunId=await rebuildCompetitionRanking(competition.id);
  const dependentRankingRuns=await rebuildDependentRankings(competition.id);
  return Response.json({adjustmentId:adjustment.id,rankingRunId,dependentRankingRuns},{status:201});
}

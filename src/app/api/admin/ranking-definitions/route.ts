import { z } from "zod";
import { db } from "@/db";
import { auditLogs, rankingDefinitions } from "@/db/schema";
import { requireOrgRole } from "@/lib/auth";
import { rebuildScopedRanking } from "@/lib/rebuild-scoped-ranking";

import { mutationErrorStatus, requireTrustedMutationRequest } from "@/lib/request-security";
const schema=z.object({organizationId:z.string().uuid(),scope:z.enum(["series","season","year","all_time"]),scopeKey:z.string().trim().min(1).max(100),name:z.string().trim().min(2).max(120),dropLowest:z.number().int().min(0).max(100).default(0),minCompetitions:z.number().int().min(0).max(100).default(0),positionPoints:z.record(z.string(),z.number().finite()).default({"1":25,"2":18,"3":15,"4":12,"5":10,"6":8,"7":6,"8":4,"9":2,"10":1})});
export async function POST(request:Request){
 try { requireTrustedMutationRequest(request); } catch(error) { return Response.json({error:error instanceof Error?error.message:"BAD_REQUEST"},{status:mutationErrorStatus(error)}); }
 const parsed=schema.safeParse(await request.json()); if(!parsed.success) return Response.json({error:parsed.error.flatten()},{status:400});
 const input=parsed.data; const {user}=await requireOrgRole(input.organizationId,"admin");
 const [definition]=await db.insert(rankingDefinitions).values({organizationId:input.organizationId,scope:input.scope,scopeKey:input.scopeKey,name:input.name,config:{positionPoints:input.positionPoints,dropLowest:input.dropLowest,minCompetitions:input.minCompetitions}}).onConflictDoUpdate({target:[rankingDefinitions.organizationId,rankingDefinitions.scope,rankingDefinitions.scopeKey],set:{name:input.name,config:{positionPoints:input.positionPoints,dropLowest:input.dropLowest,minCompetitions:input.minCompetitions},updatedAt:new Date()}}).returning();
 const runId=await rebuildScopedRanking(definition.id);
 await db.insert(auditLogs).values({organizationId:input.organizationId,actorUserId:user.id,action:"ranking_definition.published",entityType:"ranking_definition",entityId:definition.id,payload:{scope:input.scope,scopeKey:input.scopeKey,runId}});
 return Response.json({definitionId:definition.id,rankingRunId:runId},{status:201});
}

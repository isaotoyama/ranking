import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { players, rankingDefinitions, rankingEntries } from "@/db/schema";
import { assertApiScope, authenticateApiKey, consumeUsage } from "@/lib/api-keys";

const allowed=new Set(["series","season","year","all_time"] as const);
type Scope="series"|"season"|"year"|"all_time";
export async function GET(request:Request,{params}:{params:Promise<{scope:string;key:string}>}){
  const authz=await authenticateApiKey(request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??null);
  if(!authz) return Response.json({error:"Invalid API key"},{status:401});
  const {scope:requestedScope,key}=await params;
  const rawScope=requestedScope==="all-time"?"all_time":requestedScope;
  if(!allowed.has(rawScope as Scope)) return Response.json({error:"Unsupported scope"},{status:404});
  const scope=rawScope as Scope;
  try{assertApiScope(authz,scope);}catch(error){const code=error instanceof Error?error.message:"FORBIDDEN";return Response.json({error:code},{status:code==="MONTHLY_QUOTA_EXCEEDED"?429:403});}
  const definition=await db.query.rankingDefinitions.findFirst({where:and(eq(rankingDefinitions.organizationId,authz.org.id),eq(rankingDefinitions.scope,scope),eq(rankingDefinitions.scopeKey,key))});
  if(!definition?.publishedRankingRunId) return Response.json({error:"Ranking not published"},{status:404});
  const entries=await db.select({rank:rankingEntries.rank,value:rankingEntries.value,breakdown:rankingEntries.breakdown,playerId:players.id,playerName:players.displayName,playerSlug:players.slug}).from(rankingEntries).innerJoin(players,eq(players.id,rankingEntries.playerId)).where(eq(rankingEntries.rankingRunId,definition.publishedRankingRunId)).orderBy(rankingEntries.rank);
  try { await consumeUsage(authz.key.id,authz.org.id,authz.org.plan,scope); } catch(error) { return Response.json({error:error instanceof Error?error.message:"USAGE_ERROR"},{status:429}); }
  return Response.json({ranking:{id:definition.id,name:definition.name,scope:definition.scope,scopeKey:definition.scopeKey},entries});
}

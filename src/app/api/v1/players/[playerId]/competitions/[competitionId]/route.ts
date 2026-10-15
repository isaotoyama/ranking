import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { competitions, rankingEntries, resultAdjustments, results, rounds } from "@/db/schema";
import { assertApiScope, authenticateApiKey, consumeUsage } from "@/lib/api-keys";

export async function GET(request: Request, { params }: { params: Promise<{playerId:string;competitionId:string}> }) {
  const authz=await authenticateApiKey(request.headers.get("authorization")?.replace(/^Bearer\s+/i,"") ?? null);
  if(!authz) return Response.json({error:"Invalid API key"},{status:401});
  try { assertApiScope(authz,"competition"); } catch(error) { return Response.json({error:error instanceof Error?error.message:"FORBIDDEN"},{status:403}); }
  const {playerId,competitionId}=await params;
  const competition=await db.query.competitions.findFirst({where:eq(competitions.id,competitionId)});
  if(!competition || (competition.visibility==="private" && competition.organizationId!==authz.org.id)) return Response.json({error:"Not found"},{status:404});
  const raw=await db.select({id:results.id,roundId:results.roundId,roundNumber:rounds.roundNumber,attemptNumber:results.attemptNumber,rawValue:results.rawValue,status:results.status,recordedAt:results.recordedAt}).from(results).innerJoin(rounds,eq(rounds.id,results.roundId)).where(and(eq(results.competitionId,competitionId),eq(results.playerId,playerId))).orderBy(rounds.roundNumber,results.attemptNumber);
  const adjustmentRows=raw.length?await db.select().from(resultAdjustments).where(inArray(resultAdjustments.resultId, raw.map(r=>r.id))):[];
  const rawIds=new Set(raw.map(r=>r.id));
  const adjustmentByResult=new Map<string,number>();
  for(const a of adjustmentRows) if(rawIds.has(a.resultId)) adjustmentByResult.set(a.resultId,(adjustmentByResult.get(a.resultId)??0)+a.delta);
  const published=competition.publishedRankingRunId?await db.query.rankingEntries.findFirst({where:and(eq(rankingEntries.rankingRunId,competition.publishedRankingRunId),eq(rankingEntries.playerId,playerId))}):null;
  try { await consumeUsage(authz.key.id,authz.org.id,authz.org.plan,"competition"); } catch(error) { return Response.json({error:error instanceof Error?error.message:"USAGE_ERROR"},{status:429}); }
  return Response.json({competition:{id:competition.id,name:competition.name,metric:competition.metric,aggregation:competition.aggregation,direction:competition.direction,unit:competition.unit},playerId,final:published?{rank:published.rank,value:published.value,breakdown:published.breakdown}:null,results:raw.map(r=>({...r,adjustment:adjustmentByResult.get(r.id)??0,adjustedValue:r.rawValue==null?null:r.rawValue+(adjustmentByResult.get(r.id)??0)}))});
}

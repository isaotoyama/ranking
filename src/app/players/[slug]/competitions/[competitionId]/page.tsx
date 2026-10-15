import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { competitions, players, rankingEntries, resultAdjustments, results, rounds } from "@/db/schema";

export default async function PlayerCompetitionPage({ params }: { params: Promise<{slug:string;competitionId:string}> }) {
  const {slug,competitionId}=await params;
  const player=await db.query.players.findFirst({where:eq(players.slug,slug)});
  const competition=await db.query.competitions.findFirst({where:eq(competitions.id,competitionId)});
  if(!player || !competition || competition.visibility==="private" || !competition.publishedRankingRunId) notFound();
  const final=await db.query.rankingEntries.findFirst({where:and(eq(rankingEntries.rankingRunId,competition.publishedRankingRunId),eq(rankingEntries.playerId,player.id))});
  if(!final) notFound();
  const raw=await db.select({id:results.id,roundId:results.roundId,roundNumber:rounds.roundNumber,label:rounds.label,attemptNumber:results.attemptNumber,rawValue:results.rawValue,status:results.status,recordedAt:results.recordedAt}).from(results).innerJoin(rounds,eq(rounds.id,results.roundId)).where(and(eq(results.competitionId,competition.id),eq(results.playerId,player.id))).orderBy(rounds.roundNumber,results.attemptNumber);
  const adjustments=raw.length?await db.select().from(resultAdjustments).where(inArray(resultAdjustments.resultId,raw.map(r=>r.id))):[];
  const adjustmentByResult=new Map<string,number>(); for(const a of adjustments) adjustmentByResult.set(a.resultId,(adjustmentByResult.get(a.resultId)??0)+a.delta);
  const byRound=new Map<number,typeof raw>(); for(const r of raw) byRound.set(r.roundNumber,[...(byRound.get(r.roundNumber)??[]),r]);
  const countedRounds=new Set(final.breakdown.kind==="competition"?final.breakdown.rounds.filter(r=>r.counted).map(r=>r.roundNumber):[]);

  return <main className="container section"><div className="kicker">{competition.name}</div><h1 style={{fontSize:"58px"}}>{player.displayName}</h1>
    <div className="grid3"><div className="card"><div className="kicker">FINAL RANK</div><h2>#{final.rank}</h2></div><div className="card"><div className="kicker">FINAL RESULT</div><h2>{formatValue(final.value)} {competition.unit}</h2></div><div className="card"><div className="kicker">CALCULATION</div><h3>{humanRule(competition.aggregation)}</h3><p className="meta">Attempt rule: {competition.settings.attemptAggregation ?? (competition.direction==="asc"?"min":"max")}</p></div></div>
    <section className="section"><h2>All rounds and attempts</h2><p className="meta">Raw values are never overwritten. Corrections are represented as adjustment records.</p><div style={{display:"grid",gap:12}}>{[...byRound.entries()].map(([roundNumber,attempts])=><div className={`card ${countedRounds.has(roundNumber)?"counted":""}`} key={roundNumber}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><div><div className="kicker">ROUND {roundNumber}</div><h3>{attempts[0]?.label ?? `Round ${roundNumber}`}</h3></div>{countedRounds.has(roundNumber)&&<span className="pill">COUNTED</span>}</div><table className="table"><thead><tr><th>Attempt</th><th>Status</th><th>Raw</th><th>Adjustment</th><th>Effective</th></tr></thead><tbody>{attempts.map(a=>{const adj=adjustmentByResult.get(a.id)??0;return <tr key={a.id}><td>{a.attemptNumber}</td><td>{a.status}</td><td>{a.rawValue==null?"—":`${formatValue(a.rawValue)} ${competition.unit}`}</td><td>{adj===0?"—":`${adj>0?"+":""}${formatValue(adj)}`}</td><td className="value">{a.rawValue==null?"—":`${formatValue(a.rawValue+adj)} ${competition.unit}`}</td></tr>})}</tbody></table></div>)}</div></section>
  </main>;
}
function formatValue(value:number){return Number.isInteger(value)?value.toLocaleString():value.toLocaleString(undefined,{maximumFractionDigits:3});}
function humanRule(rule:string){return ({min:"Fastest / minimum round",max:"Best / maximum round",sum:"Total of rounds",average:"Average of rounds",best_n_sum:"Best N rounds total",final_only:"Final round only",position_points:"Position converted to points"} as Record<string,string>)[rule]??rule;}

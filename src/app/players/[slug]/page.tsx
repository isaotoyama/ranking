import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { competitions, players, rankingEntries, rankingRuns } from "@/db/schema";

export default async function PlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const player = await db.query.players.findFirst({ where: eq(players.slug, slug) });
  if (!player) notFound();

  const history = await db.select({
    competitionId: competitions.id,
    competitionName: competitions.name,
    startsAt: competitions.startsAt,
    metric: competitions.metric,
    aggregation: competitions.aggregation,
    unit: competitions.unit,
    rank: rankingEntries.rank,
    value: rankingEntries.value,
  }).from(rankingEntries)
    .innerJoin(rankingRuns, eq(rankingRuns.id, rankingEntries.rankingRunId))
    .innerJoin(competitions, eq(competitions.id, rankingRuns.competitionId))
    .where(and(
      eq(rankingEntries.playerId, player.id),
      eq(rankingRuns.scope, "competition"),
      eq(competitions.visibility, "public"),
      eq(rankingEntries.rankingRunId, competitions.publishedRankingRunId),
    ))
    .orderBy(desc(competitions.startsAt), desc(rankingRuns.createdAt));

  const wins = history.filter((h) => h.rank === 1).length;
  const podiums = history.filter((h) => h.rank <= 3).length;
  return <main className="container section">
    <div className="eyebrow">Player profile</div>
    <h1 style={{fontSize:"58px"}}>{player.displayName}</h1>
    <p className="lede">{player.countryCode ? `${player.countryCode} · ` : ""}{history.length} published competitions</p>
    <div className="stats">
      <div className="card stat"><span className="meta">Competitions</span><strong>{history.length}</strong></div>
      <div className="card stat"><span className="meta">Wins</span><strong>{wins}</strong></div>
      <div className="card stat"><span className="meta">Podiums</span><strong>{podiums}</strong></div>
      <div className="card stat"><span className="meta">Verified</span><strong style={{fontSize:20}}>{player.verified ? "Yes" : "—"}</strong></div>
    </div>
    <div className="card"><h3>Competition history</h3>{history.length === 0 ? <p className="meta">No public results yet.</p> : <table className="table"><thead><tr><th>Competition</th><th>Type</th><th>Rank</th><th>Result</th></tr></thead><tbody>{history.map((h)=><tr key={h.competitionId}><td><Link href={`/players/${player.slug}/competitions/${h.competitionId}`}><strong>{h.competitionName}</strong></Link><div className="meta">{h.startsAt ? h.startsAt.toISOString().slice(0,10) : "Date TBD"}</div></td><td>{h.metric} · {h.aggregation}</td><td>#{h.rank}</td><td className="value">{formatValue(h.value)} {h.unit}</td></tr>)}</tbody></table>}</div>
  </main>;
}

function formatValue(value:number){ return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined,{maximumFractionDigits:3}); }

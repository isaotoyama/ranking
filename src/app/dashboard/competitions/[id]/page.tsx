import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  competitionParticipants,
  competitions,
  players,
  rankingEntries,
  results,
  rounds,
} from "@/db/schema";
import { requireOrgRole } from "@/lib/auth";
import { recordResult, registerPlayer } from "./actions";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 8,
  padding: "12px 13px",
  border: "1px solid var(--line)",
  borderRadius: 10,
  background: "white",
};

export default async function CompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const competition = await db.query.competitions.findFirst({ where: eq(competitions.id, id) });
  if (!competition) notFound();
  const { role } = await requireOrgRole(competition.organizationId, "viewer");
  const canScore = role === "owner" || role === "admin" || role === "scorer";

  const [roundRows, participantRows, resultStats] = await Promise.all([
    db.select().from(rounds).where(eq(rounds.competitionId, id)).orderBy(rounds.roundNumber),
    db.select({ playerId: players.id, name: players.displayName, slug: players.slug, countryCode: players.countryCode })
      .from(competitionParticipants)
      .innerJoin(players, eq(players.id, competitionParticipants.playerId))
      .where(eq(competitionParticipants.competitionId, id))
      .orderBy(players.displayName),
    db.select({ playerId: results.playerId, count: sql<number>`count(*)::int` })
      .from(results)
      .where(eq(results.competitionId, id))
      .groupBy(results.playerId),
  ]);

  const entries = competition.publishedRankingRunId
    ? await db.select({
        playerId: rankingEntries.playerId,
        rank: rankingEntries.rank,
        value: rankingEntries.value,
        breakdown: rankingEntries.breakdown,
        playerName: players.displayName,
        slug: players.slug,
      }).from(rankingEntries)
        .innerJoin(players, eq(players.id, rankingEntries.playerId))
        .where(eq(rankingEntries.rankingRunId, competition.publishedRankingRunId))
        .orderBy(rankingEntries.rank)
    : [];

  const resultCountByPlayer = new Map(resultStats.map((x) => [x.playerId, x.count]));
  const playerIds = participantRows.map((p) => p.playerId);
  const recentResults = playerIds.length
    ? await db.select({
        id: results.id,
        playerId: results.playerId,
        roundId: results.roundId,
        attemptNumber: results.attemptNumber,
        rawValue: results.rawValue,
        status: results.status,
        recordedAt: results.recordedAt,
      }).from(results)
        .where(and(eq(results.competitionId, id), inArray(results.playerId, playerIds)))
        .orderBy(sql`${results.recordedAt} desc`)
        .limit(12)
    : [];

  const playerById = new Map(participantRows.map((p) => [p.playerId, p]));
  const roundById = new Map(roundRows.map((r) => [r.id, r]));

  return <main className="container section">
    <div className="kicker">{competition.metric.toUpperCase()} · {competition.aggregation.toUpperCase()} · {competition.direction === "asc" ? "LOWER WINS" : "HIGHER WINS"}</div>
    <h1 style={{ fontSize: "54px" }}>{competition.name}</h1>
    <div className="actions" style={{ marginTop: -8, marginBottom: 18 }}>
      <Link className="button" href="/dashboard">← Dashboard</Link>
      <span className="pill">{competition.status}</span>
    </div>

    <div className="stats">
      <div className="card stat"><span className="meta">Rounds</span><strong>{roundRows.length}</strong></div>
      <div className="card stat"><span className="meta">Players</span><strong>{participantRows.length}</strong></div>
      <div className="card stat"><span className="meta">Results</span><strong>{resultStats.reduce((sum, r) => sum + r.count, 0)}</strong></div>
      <div className="card stat"><span className="meta">Unit</span><strong style={{ fontSize: 20 }}>{competition.unit}</strong></div>
    </div>

    <div className="grid3">
      <section className="card" style={{ gridColumn: "span 2" }}>
        <div className="demo-head"><div><div className="kicker">CURRENT PUBLISHED RESULT</div><h3>Leaderboard</h3></div><span className="pill">{entries.length ? "PUBLISHED" : "NO RESULTS"}</span></div>
        {!entries.length ? <p className="meta">Record the first valid result to publish this competition ranking.</p> : <table className="table"><thead><tr><th>Rank</th><th>Player</th><th>Final result</th><th>Raw records</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.playerId}>
          <td><strong>#{entry.rank}</strong></td>
          <td><Link href={`/players/${entry.slug}/competitions/${competition.id}`}><strong>{entry.playerName}</strong></Link></td>
          <td className="value">{entry.value} {competition.unit}</td>
          <td>{resultCountByPlayer.get(entry.playerId) ?? 0}</td>
        </tr>)}</tbody></table>}
      </section>

      <section className="card">
        <div className="kicker">CALCULATION</div>
        <h3>{competition.aggregation.replaceAll("_", " ")}</h3>
        <p className="meta">Attempts in each round use <strong>{competition.settings.attemptAggregation ?? (competition.direction === "asc" ? "min" : "max")}</strong>, then the competition uses <strong>{competition.aggregation}</strong> across rounds.</p>
        {competition.settings.bestN ? <p className="meta">Best N: <strong>{competition.settings.bestN}</strong></p> : null}
      </section>
    </div>

    {canScore ? <div className="grid3" style={{ marginTop: 16 }}>
      <section className="card">
        <div className="kicker">STEP 1</div><h3>Register player</h3>
        <form action={registerPlayer} style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="competitionId" value={competition.id} />
          <label>Player name<input name="displayName" required maxLength={100} placeholder="Player name" style={inputStyle} /></label>
          <label>Country code<input name="countryCode" maxLength={2} placeholder="JP" style={inputStyle} /></label>
          <button className="button" type="submit">Add player</button>
        </form>
      </section>

      <section className="card" style={{ gridColumn: "span 2" }}>
        <div className="kicker">STEP 2</div><h3>Record round result</h3>
        {!participantRows.length ? <p className="meta">Register a player first.</p> : <form action={recordResult} style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="competitionId" value={competition.id} />
          <div className="grid3">
            <label>Player<select name="playerId" required style={inputStyle}>{participantRows.map((p) => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}</select></label>
            <label>Round<select name="roundId" required style={inputStyle}>{roundRows.map((r) => <option key={r.id} value={r.id}>Round {r.roundNumber}{r.label ? ` — ${r.label}` : ""}</option>)}</select></label>
            <label>Attempt<input type="number" name="attemptNumber" min="1" max="1000" defaultValue="1" style={inputStyle} /></label>
          </div>
          <div className="grid3">
            <label>Result ({competition.unit})<input name="rawValue" inputMode="decimal" placeholder={competition.metric === "time" ? "42.381" : "95"} style={inputStyle} /></label>
            <label>Status<select name="status" defaultValue="valid" style={inputStyle}><option value="valid">Valid</option><option value="dns">DNS</option><option value="dnf">DNF</option><option value="dsq">DSQ</option><option value="void">Void</option></select></label>
            <div style={{ display: "flex", alignItems: "end" }}><button className="button primary" type="submit" style={{ width: "100%" }}>Save + republish ranking</button></div>
          </div>
          <p className="meta" style={{ margin: 0 }}>Raw results are append-only. Post-publication corrections are stored as separate adjustment records.</p>
        </form>}
      </section>
    </div> : null}

    <div className="grid3" style={{ marginTop: 16 }}>
      <section className="card" style={{ gridColumn: "span 2" }}><h3>Rounds</h3><div className="rounds">{roundRows.map((r) => <div className="round" key={r.id}><span className="num">ROUND {r.roundNumber}</span><strong>{r.label || `Round ${r.roundNumber}`}</strong></div>)}</div></section>
      <section className="card"><h3>Players</h3>{!participantRows.length ? <p className="meta">None yet.</p> : participantRows.map((p) => <div className="row" key={p.playerId}><div className="rank">{p.countryCode ?? "•"}</div><div><Link href={`/players/${p.slug}`}><strong>{p.name}</strong></Link><div className="meta">{resultCountByPlayer.get(p.playerId) ?? 0} raw results</div></div></div>)}</section>
    </div>

    <section className="card" style={{ marginTop: 16 }}>
      <div className="kicker">AUDIT TRAIL</div><h3>Recent raw results</h3>
      {!recentResults.length ? <p className="meta">No results recorded.</p> : <table className="table"><thead><tr><th>Player</th><th>Round</th><th>Attempt</th><th>Result</th><th>Status</th><th>Recorded</th></tr></thead><tbody>{recentResults.map((r) => <tr key={r.id}><td>{playerById.get(r.playerId)?.name ?? "Unknown"}</td><td>{roundById.get(r.roundId)?.roundNumber ?? "—"}</td><td>{r.attemptNumber}</td><td>{r.rawValue == null ? "—" : `${r.rawValue} ${competition.unit}`}</td><td>{r.status}</td><td>{r.recordedAt.toISOString().replace("T", " ").slice(0, 16)} UTC</td></tr>)}</tbody></table>}
    </section>
  </main>;
}

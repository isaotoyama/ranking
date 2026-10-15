import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createCompetition } from "./actions";

export default async function NewCompetitionPage({ searchParams }: { searchParams: Promise<{ organizationId?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const owned = await db.select({id:organizations.id,name:organizations.name}).from(organizations).where(eq(organizations.ownerUserId,user.id));
  const organizationId = sp.organizationId && owned.some(o=>o.id===sp.organizationId) ? sp.organizationId : owned[0]?.id;
  if (!organizationId) return <main className="container section"><div className="notice">Create an organization before creating a competition.</div><p><a className="button primary" href="/dashboard/setup">Create organization</a></p></main>;
  return <main className="container section" style={{maxWidth:820}}><div className="eyebrow">New competition</div><h1 style={{fontSize:"54px"}}>Define how winning is calculated.</h1>
    <form action={createCompetition} className="card" style={{display:"grid",gap:16}}>
      <input type="hidden" name="organizationId" value={organizationId}/>
      <label>Competition name<input name="name" required placeholder="Tokyo Speed Cup" style={inputStyle}/></label>
      <div className="grid3">
        <label>Metric<select name="metric" defaultValue="score" style={inputStyle}><option value="time">Time</option><option value="score">Score</option><option value="points">Points</option><option value="position">Position</option></select></label>
        <label>Final calculation<select name="aggregation" defaultValue="max" style={inputStyle}><option value="min">Fastest / minimum</option><option value="max">Best / maximum</option><option value="sum">Total</option><option value="average">Average</option><option value="best_n_sum">Best N total</option><option value="final_only">Final round only</option><option value="position_points">Position → points</option></select></label>
        <label>Ranking direction<select name="direction" defaultValue="desc" style={inputStyle}><option value="desc">Higher wins</option><option value="asc">Lower wins</option></select></label>
      </div>
      <div className="grid3">
        <label>Rounds<input type="number" name="roundCount" min="1" max="100" defaultValue="6" style={inputStyle}/></label>
        <label>Unit<input name="unit" defaultValue="pts" maxLength={20} style={inputStyle}/></label>
        <label>Best N (if used)<input type="number" name="bestN" min="1" max="100" placeholder="3" style={inputStyle}/></label>
      </div>
      <label>Multiple attempts inside one round<select name="attemptAggregation" defaultValue="max" style={inputStyle}><option value="max">Best / maximum attempt</option><option value="min">Fastest / minimum attempt</option><option value="latest">Latest attempt</option><option value="sum">Total attempts</option><option value="average">Average attempts</option></select></label>
      <button className="button primary" type="submit">Create competition + rounds</button>
    </form>
  </main>;
}

const inputStyle: React.CSSProperties = {display:"block",width:"100%",marginTop:8,padding:"12px 13px",border:"1px solid var(--line)",borderRadius:10,background:"white"};

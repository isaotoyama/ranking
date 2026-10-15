import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { competitions, organizations } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser();
  const orgs = await db.select().from(organizations).where(eq(organizations.ownerUserId, user.id));
  const orgIds = orgs.map(o=>o.id);
  const comps = orgIds.length ? await db.select().from(competitions).where(inArray(competitions.organizationId, orgIds)).orderBy(competitions.createdAt) : [];

  return <main className="container dashboard"><div className="dashboard-grid"><aside className="sidebar"><Link className="active" href="/dashboard">Overview</Link><a aria-disabled="true">Competitions</a><a aria-disabled="true">Players</a><a aria-disabled="true">Series</a><Link href="/dashboard/api-keys">API keys</Link><Link href="/dashboard/billing">Billing</Link></aside><section>
    <div className="kicker">SIGNED IN</div><h1 style={{fontSize:"48px"}}>Welcome{user.displayName ? `, ${user.displayName}` : ""}.</h1>
    {!orgs.length ? <div className="notice">Start by creating an organization. It will own competitions, API keys and billing.<div className="actions"><Link className="button primary" href="/dashboard/setup">Create organization</Link></div></div> : <div className="actions"><Link className="button primary" href={`/dashboard/competitions/new?organizationId=${orgs[0].id}`}>New competition</Link></div>}
    <div className="stats"><div className="card stat"><span className="meta">Organizations</span><strong>{orgs.length}</strong></div><div className="card stat"><span className="meta">Competitions</span><strong>{comps.length}</strong></div><div className="card stat"><span className="meta">Running</span><strong>{comps.filter(c=>c.status==="running").length}</strong></div><div className="card stat"><span className="meta">Published</span><strong>{comps.filter(c=>c.publishedRankingRunId).length}</strong></div></div>
    <div className="card"><h3>Competitions</h3>{!comps.length ? <p className="meta">No competitions yet.</p> : <table className="table"><thead><tr><th>Name</th><th>Metric</th><th>Rule</th><th>Status</th></tr></thead><tbody>{comps.map(c=><tr key={c.id}><td><Link href={`/dashboard/competitions/${c.id}`}><strong>{c.name}</strong></Link></td><td>{c.metric}</td><td>{c.aggregation}</td><td><span className="pill">{c.status}</span></td></tr>)}</tbody></table>}</div>
  </section></div></main>;
}

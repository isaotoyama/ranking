import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { apiKeys, organizations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import ApiKeyCreator from "./ApiKeyCreator";

export default async function ApiKeysPage() {
  const user = await requireUser();
  const org = await db.query.organizations.findFirst({ where: eq(organizations.ownerUserId, user.id) });
  if (!org) return <main className="container section"><div className="notice">Create an organization first.</div><p><Link className="button primary" href="/dashboard/setup">Create organization</Link></p></main>;
  const keys = await db.select({ id:apiKeys.id,name:apiKeys.name,prefix:apiKeys.keyPrefix,lastFour:apiKeys.lastFour,lastUsedAt:apiKeys.lastUsedAt,createdAt:apiKeys.createdAt,revokedAt:apiKeys.revokedAt }).from(apiKeys).where(eq(apiKeys.organizationId,org.id)).orderBy(apiKeys.createdAt);

  return <main className="container section" style={{ maxWidth: 900 }}>
    <div className="kicker">DEVELOPER ACCESS · {org.name}</div><h1 style={{fontSize:54}}>API keys</h1>
    <p className="lede">Keys are hashed at rest. The full secret is returned only once when you create it.</p>
    <section className="card"><h3>Create key</h3><ApiKeyCreator organizationId={org.id}/></section>
    <section className="card" style={{marginTop:16}}><h3>Existing keys</h3>{!keys.length?<p className="meta">No API keys yet.</p>:<table className="table"><thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th>Status</th></tr></thead><tbody>{keys.map(k=><tr key={k.id}><td><strong>{k.name}</strong></td><td><code>{k.prefix}••••{k.lastFour}</code></td><td>{k.createdAt.toISOString().slice(0,10)}</td><td>{k.lastUsedAt?.toISOString().slice(0,10)??"Never"}</td><td><span className="pill">{k.revokedAt?"revoked":"active"}</span></td></tr>)}</tbody></table>}</section>
    <div className="actions"><Link className="button" href="/developers">API documentation</Link><Link className="button" href="/dashboard">← Dashboard</Link></div>
  </main>;
}

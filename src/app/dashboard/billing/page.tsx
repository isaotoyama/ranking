import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { organizations, subscriptions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import BillingActions from "./BillingActions";

export default async function BillingPage() {
  const user = await requireUser();
  const org = await db.query.organizations.findFirst({ where: eq(organizations.ownerUserId,user.id) });
  if(!org) return <main className="container section"><div className="notice">Create an organization first.</div><p><Link className="button primary" href="/dashboard/setup">Create organization</Link></p></main>;
  const subscription = await db.query.subscriptions.findFirst({ where:eq(subscriptions.organizationId,org.id) });
  const plans=[
    {name:"Organizer",priceId:process.env.STRIPE_PRICE_ORGANIZER??null,description:"Competition + annual ranking API access; 25k monthly API units."},
    {name:"League",priceId:process.env.STRIPE_PRICE_LEAGUE??null,description:"Series, season and year rankings; 250k monthly API units."},
    {name:"Data",priceId:process.env.STRIPE_PRICE_DATA??null,description:"All-time data and up to 1M monthly API units."},
  ];
  return <main className="container section">
    <div className="kicker">BILLING · {org.name}</div><h1 style={{fontSize:54}}>Plans & API entitlement</h1>
    <div className="stats"><div className="card stat"><span className="meta">Current plan</span><strong style={{fontSize:24}}>{org.plan}</strong></div><div className="card stat"><span className="meta">Subscription</span><strong style={{fontSize:20}}>{subscription?.status??"none"}</strong></div><div className="card stat"><span className="meta">Renews / ends</span><strong style={{fontSize:18}}>{subscription?.currentPeriodEnd?.toISOString().slice(0,10)??"—"}</strong></div><div className="card stat"><span className="meta">Plan source</span><strong style={{fontSize:18}}>Stripe webhook</strong></div></div>
    <BillingActions organizationId={org.id} plans={plans}/>
    <p className="meta" style={{marginTop:16}}>The browser never sets organization entitlements. Plan changes become active only after a verified Stripe webhook updates the database.</p>
    <div className="actions"><Link className="button" href="/dashboard">← Dashboard</Link></div>
  </main>;
}

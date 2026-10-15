"use client";

import { useState } from "react";

type Plan = { name: string; priceId: string | null; description: string };
export default function BillingActions({ organizationId, plans }: { organizationId: string; plans: Plan[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function checkout(plan: Plan) {
    if (!plan.priceId) { setError(`${plan.name} price is not configured.`); return; }
    setBusy(plan.name); setError(null);
    try {
      const response = await fetch("/api/billing/checkout", { method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({organizationId,priceId:plan.priceId}) });
      const body = await response.json();
      if(!response.ok || !body.url) throw new Error(typeof body.error === "string" ? body.error : "Could not start checkout");
      window.location.assign(body.url);
    } catch(e) { setError(e instanceof Error ? e.message : "Could not start checkout"); setBusy(null); }
  }
  return <div className="grid3">{plans.map(p=><article className="card" key={p.name}><div className="kicker">{p.name.toUpperCase()}</div><h3>{p.name}</h3><p className="meta">{p.description}</p><button className="button primary" disabled={Boolean(busy)||!p.priceId} onClick={()=>checkout(p)}>{busy===p.name?"Opening Stripe…":p.priceId?`Choose ${p.name}`:"Configure price"}</button></article>)}{error?<p className="notice" role="alert" style={{gridColumn:"1 / -1"}}>{error}</p>:null}</div>;
}

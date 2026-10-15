"use client";

import { useState } from "react";

export default function ApiKeyCreator({ organizationId }: { organizationId: string }) {
  const [name, setName] = useState("Production");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null); setCreatedKey(null);
    try {
      const response = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, name }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not create API key");
      setCreatedKey(body.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create API key");
    } finally { setBusy(false); }
  }

  return <div>
    <form onSubmit={createKey} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <label style={{ flex: "1 1 260px" }}>Key name
        <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required style={{ display:"block",width:"100%",marginTop:8,padding:"12px 13px",border:"1px solid var(--line)",borderRadius:10 }} />
      </label>
      <button className="button primary" disabled={busy} style={{ alignSelf: "end" }}>{busy ? "Creating…" : "Create API key"}</button>
    </form>
    {error ? <p className="notice" role="alert">{error}</p> : null}
    {createdKey ? <div className="notice" style={{ marginTop: 16 }}><strong>Copy this key now. It will not be shown again.</strong><pre style={{ whiteSpace:"pre-wrap",overflowWrap:"anywhere",marginBottom:0 }}>{createdKey}</pre></div> : null}
  </div>;
}

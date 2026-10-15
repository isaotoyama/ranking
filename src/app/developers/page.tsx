export default function DevelopersPage() {
  return <main className="container section"><div className="eyebrow">API</div><h1 style={{fontSize:"58px"}}>Ranking data as a service.</h1><p className="lede">Use organization API keys to read published competition rankings and player-level round breakdowns. Keys are hashed at rest; raw keys are shown only at creation.</p>
  <div className="grid3 section"><div className="card"><h3>Competition</h3><code>GET /api/v1/rankings/competition/:id</code><p className="meta">1 usage unit</p></div><div className="card"><h3>Series / Year</h3><code>GET /api/v1/rankings/year/2026</code><p className="meta">2 usage units</p></div><div className="card"><h3>All-time</h3><code>GET /api/v1/rankings/all-time</code><p className="meta">5 usage units</p></div></div>
  </main>;
}

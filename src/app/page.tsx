import Link from "next/link";

const rows = [
  ["1", "Maya Chen", "95 pts"],
  ["2", "Isao Toyama", "91 pts"],
  ["3", "Alex Rivera", "88 pts"],
  ["4", "Jordan Lee", "84 pts"],
];

export default function Home() {
  return <main>
    <section className="container hero">
      <div>
        <div className="eyebrow">Competition data infrastructure</div>
        <h1>Every round. Every result. One ranking system.</h1>
        <p className="lede">Run fastest-time races, highest-score challenges, total-point series, best-of-N rounds and position-based competitions — then publish player history, season rankings and API access from one audited dataset.</p>
        <div className="actions"><Link className="button primary" href="/dashboard">Create competition</Link><Link className="button" href="/developers">View API model</Link></div>
      </div>
      <div className="card demo-card">
        <div className="demo-head"><div><div className="kicker">Tokyo Score Series · 6 rounds</div><h3>Best score wins</h3></div><span className="pill">LIVE</span></div>
        {rows.map(([rank,name,value]) => <div className="row" key={name}><div className="rank">{rank}</div><div><strong>{name}</strong><div className="meta">6 results recorded</div></div><div className="value">{value}</div></div>)}
      </div>
    </section>
    <section className="container section"><h2>One engine, different competition logic.</h2><div className="grid3">
      <div className="card"><div className="kicker">FASTEST</div><h3>42.381 sec</h3><p className="meta">Take the minimum valid result from any round.</p></div>
      <div className="card"><div className="kicker">BEST SCORE</div><h3>9,850 pts</h3><p className="meta">Take the maximum valid result while preserving all rounds.</p></div>
      <div className="card"><div className="kicker">TOTAL / BEST N</div><h3>527 pts</h3><p className="meta">Sum all rounds, or count only the best N results.</p></div>
    </div></section>
  </main>;
}

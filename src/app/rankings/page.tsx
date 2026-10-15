export default function RankingsPage() {
  const rounds = [82,91,87,96,88,83];
  return <main className="container section">
    <div className="kicker">PUBLIC PLAYER RESULT</div><h1 style={{fontSize:"54px"}}>Tokyo Design Challenge</h1>
    <div className="grid3"><div className="card"><div className="kicker">FINAL RANK</div><h2>#2</h2></div><div className="card"><div className="kicker">FINAL RESULT</div><h2>96 pts</h2></div><div className="card"><div className="kicker">RULE</div><h3>Best score from 6 rounds</h3></div></div>
    <div className="section"><h2>Round results</h2><p className="meta">Every final number remains traceable to its underlying result.</p><div className="rounds">{rounds.map((v,i)=><div className={`round ${v===96?"counted":""}`} key={i}><span className="num">ROUND {i+1}</span><strong>{v} pts</strong>{v===96&&<span className="meta">Counted ✓</span>}</div>)}</div></div>
  </main>;
}

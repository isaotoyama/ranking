import { createOrganization } from "./actions";

export default function SetupPage() {
  return <main className="container section" style={{maxWidth:720}}>
    <div className="eyebrow">Workspace setup</div>
    <h1 style={{fontSize:"54px"}}>Create your organization.</h1>
    <p className="lede">Organizations own competitions, API keys, billing and scorer permissions. Player identities remain independent.</p>
    <form action={createOrganization} className="card" style={{marginTop:28}}>
      <label htmlFor="name"><strong>Organization name</strong></label>
      <input id="name" name="name" required minLength={2} maxLength={100} placeholder="Tokyo Racing League" style={{display:"block",width:"100%",margin:"10px 0 18px",padding:"13px 14px",border:"1px solid var(--line)",borderRadius:10}} />
      <button className="button primary" type="submit">Create organization</button>
    </form>
  </main>;
}

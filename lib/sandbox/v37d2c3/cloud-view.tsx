/** Static branch-identifying cloud UI: intentionally never reads Supabase or enables model/write APIs. */
import Link from "next/link";
export default function CloudReadonlyView({view}:{view:"learning-space"|"workbench"}) {
  const isWorkbench=view==="workbench";
  return (
    <main className="min-h-screen bg-[#080b1c] text-slate-100 selection:bg-indigo-500/30">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_25%,rgba(99,102,241,.18),transparent_60%)]"/>
      <div className="relative mx-auto max-w-5xl px-5 py-7 sm:px-10">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 pb-5">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/25 text-lg text-indigo-200">M</div><div><p className="font-semibold tracking-wide">MyWay · Learning Experiment</p><p className="text-xs text-slate-400">V3.7D.2C.3 private cloud foundation</p></div></div>
          <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200">READ-ONLY SHELL · NO DATABASE REQUESTS</span>
        </header>
        <nav className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="Experiment views">
          <Link href="/sandbox/probe-lab/learning-space" className={`rounded-full px-4 py-2 ${!isWorkbench?"bg-indigo-500/35 text-white":"bg-white/5 text-slate-300 hover:bg-white/10"}`}>Learning Space</Link>
          <Link href="/sandbox/probe-lab/learning-space/workbench" className={`rounded-full px-4 py-2 ${isWorkbench?"bg-indigo-500/35 text-white":"bg-white/5 text-slate-300 hover:bg-white/10"}`}>Workbench</Link>
        </nav>
        <section className="mt-10 overflow-hidden rounded-3xl border border-indigo-400/20 bg-slate-900/60 p-7 shadow-2xl shadow-indigo-950/40 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-sky-300">{isWorkbench?"Workbench · Cloud status":"Learning Space · Cloud status"}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Experimental website connected</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">This deployment proves the experimental Git branch can run on its dedicated Vercel project. Live spheres, assessed turns, historical learner data, and topic updates are intentionally disabled here while we establish cloud-safe authentication, retrieval, and database access.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {[ ["Source branch","myway/learning-sandbox-v3_7a"],["Database operations","Disabled"],["Local experience","Unchanged at localhost:3001"] ].map(([key,value])=><div key={key} className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">{key}</p><p className="mt-2 break-words text-sm font-medium">{value}</p></div>)}
          </div>
        </section>
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[.035] p-6">
          <h2 className="font-semibold">Next cloud milestone</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">After verifying deployment protection and sandbox identity, add an authenticated read-only topic snapshot and a cloud embedding backend. Database writes and Model C automatic association require a separate, explicit security review.</p>
        </section>
        <p className="mt-6 text-xs text-slate-400">This is a deliberately limited cloud compatibility release, not a live copy of the local 3D Learning Space. Never use production Supabase credentials in this project.</p>
      </div>
    </main>
  );
}

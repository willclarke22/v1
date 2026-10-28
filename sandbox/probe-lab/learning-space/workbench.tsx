"use client";
import { useEffect, useState } from "react";
import { TRACE_KEY, CLARIFICATION_KEY, METRICS_KEY, type TurnTrace, type MetricRow } from "./learning-turn.client";
import Link from "next/link";
import {calculateTurnCost,formatUsd,type StageCost} from "@/sandbox/probe-lab/local-assessment/model-token-usage";

function CostBreakdown({label,info}:{label:string;info:StageCost}) {
  const billed = info.status === "estimated";
  const local = info.status === "on_device";
  const notRun = info.status === "not_run";
  return <div className="rounded-lg border border-indigo-300/15 bg-indigo-950/30 px-3 py-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{label}</strong><span>{billed?formatUsd(info.estimatedUsd):local?"US$0.000000 (local)":notRun?"Not run": "Cost unavailable"}</span></div>
    <p className="mt-1 text-xs text-blue-200/60">{info.model??"Model not recorded"} · input {info.inputTokens??"—"} · cached input {info.cachedTokens??"—"} · output {info.outputTokens??"—"} tokens</p>
    {billed?<p className="mt-1 text-[11px] text-blue-200/55">USD rates/1M: input ${info.rateInput}, cached ${info.rateCached}, output ${info.rateOutput}. {info.cachedTokens===null?"Cache detail unavailable; estimated as uncached input.":""}</p>:!local&&!notRun?<p className="mt-1 text-[11px] text-amber-200/75">Provider token usage or a verified pricing rate was unavailable. No price was assumed.</p>:null}
  </div>;
}

type Inspected = {topicId:string;label:string;diagnosis:string;learningScore:number;confusion:number;insight:number;
 scoredObservations?:{confusion?:number|null;insight?:number|null;confusionCount?:number;insightCount?:number};
  position:number[]; semanticPosition:number[]|null;positionSource:string;
  labelEmbeddingReady:boolean;repairEligible:boolean;messageEmbeddingReady:boolean;labelModel:string|null;messageModel:string|null;labelCount:number;messageCount:number};
type WorkbenchSnapshot={schema:string;mode:string;generatedAt:string; summary:{topicCount:number;labelVectors:number;messageVectors:number;relationshipCount:number;committedPositions:number;semanticPositions:number};inspect:Inspected[]};
export default function LearningSpaceWorkbench(){
  const [data,setData]=useState<WorkbenchSnapshot|null>(null);
  const [failure,setFailure]=useState<string|null>(null);
  const [selection,setSelection]=useState<string>("");
  const [reload,setReload]=useState(0);
  const [trace,setTrace]=useState<TurnTrace|null>(null);
  const [history,setHistory]=useState<MetricRow[]>([]);
  const [approveChecked,setApproveChecked]=useState(false);
  const [reviewChecked,setReviewChecked]=useState(false);
  const [reviewBusy,setReviewBusy]=useState(false);
  const [reviewStatus,setReviewStatus]=useState<string|null>(null);
  const [commitBusy,setCommitBusy]=useState(false);
  const [commitMessage,setCommitMessage]=useState<string|null>(null);
  const [commitOk,setCommitOk]=useState(false);
  const [repairChecked,setRepairChecked]=useState(false);
  const [repairBusy,setRepairBusy]=useState(false);
  const [repairNotice,setRepairNotice]=useState<string|null>(null);
  async function approveVerifierMatch(){
    const recommendation=trace?.verifier?.decision;
    const token=trace?.topicMemory?.reviewToken;
    if(!reviewChecked||reviewBusy||!token||!recommendation||
       !["same_topic_same_difficulty","same_topic_new_difficulty"].includes(recommendation.relation))return;
    setReviewBusy(true);setReviewStatus(null);
    try{
      const res=await fetch("/api/sandbox/probe-lab/learning-space/retrieve",{
        method:"POST",cache:"no-store",credentials:"same-origin",
        headers:{"Content-Type":"application/json","X-MyWay-Approval":"v37d2c2-human-review"},
        body:JSON.stringify({operation:"approve_verifier_existing",reviewToken:token,
          targetTopicId:recommendation.target_topic_id,relation:recommendation.relation,
          approvalPhrase:"I_REVIEWED_AND_APPROVE_EXISTING_TOPIC_ASSOCIATION"})
      });
      const result=await res.json() as {status?:string;verified?:boolean;topicId?:string;error?:string};
      if(!res.ok||result.status!=="committed"||!result.verified)throw Error(result.error??`Review HTTP ${res.status}`);
      setReviewStatus(`Verified manual association with topic ${result.topicId}. A scored observation was appended to that topic; no new sphere created.`);
      if(result.topicId)setSelection(result.topicId);
      setReload(n=>n+1);
    }catch(e){setReviewStatus(e instanceof Error?e.message:"Review refused");}
    finally{
      setReviewChecked(false);setReviewBusy(false);
      if(trace){const next={...trace,topicMemory:trace.topicMemory?{...trace.topicMemory,reviewToken:null}:null};setTrace(next);sessionStorage.setItem(TRACE_KEY,JSON.stringify(next));}
    }
  }
  async function repairMissingIndex(topicId:string){
    if(!repairChecked||repairBusy)return;
    setRepairBusy(true);setRepairNotice(null);
    try{
      const res=await fetch("/api/sandbox/probe-lab/learning-space/retrieve",{
        method:"POST",cache:"no-store",credentials:"same-origin",
        headers:{"Content-Type":"application/json","X-MyWay-Approval":"v37d2b-repair"},
        body:JSON.stringify({operation:"repair_approved_topic_index",topicId,approvalPhrase:"I_APPROVE_ONE_TOPIC_INDEX_REPAIR"})
      });
      const info=await res.json() as {status?:string;verified?:boolean;embeddingReady?:boolean;error?:string};
      if(!res.ok||!info.verified||!info.embeddingReady)throw Error(info.error??`Repair HTTP ${res.status}`);
      setRepairNotice(`Verified topic index: ${info.status}. Refresh the Learning Space to see its sphere.`);
      setReload(x=>x+1);
    }catch(e){setRepairNotice(e instanceof Error?e.message:"Repair refused");}
    finally{setRepairChecked(false);setRepairBusy(false);}
  }
  async function approveMemoryWrite(){
    const proposal=trace?.topicMemory;
    if(!approveChecked||commitBusy||!proposal?.approvalToken||
       !["associate_existing","propose_new"].includes(proposal.action))return;
    setCommitBusy(true);setCommitMessage(null);setCommitOk(false);
    try{
      const res=await fetch("/api/sandbox/probe-lab/learning-space/retrieve",{
        method:"POST",cache:"no-store",credentials:"same-origin",
        headers:{"Content-Type":"application/json","X-MyWay-Approval":"v37d2a"},
        body:JSON.stringify({operation:"commit_topic_memory",approvalToken:proposal.approvalToken,
          approvalPhrase:"I_APPROVE_ONE_TOPIC_MEMORY_WRITE"})
      });
      const data=await res.json() as {status?:string;action?:string;topicId?:string;verified?:boolean;embeddingReady?:boolean;positionReady?:boolean;warning?:string;error?:string;code?:string};
      if(!res.ok||data.status!=="committed"||!data.verified)throw Error(data.error??`Commit HTTP ${res.status}`);
      setCommitOk(true);
      setCommitMessage(`${data.action?.replaceAll("_"," ")}: verified topic ${data.topicId}. ${data.embeddingReady===false?"Index verification pending; do not recreate the topic.":"Refresh the Learning Space to inspect its sphere and embedding."} ${data.warning??""}`);
      if(data.topicId)setSelection(data.topicId);
      // Never leave a spent authorization in session storage.
      if(trace){const next={...trace,topicMemory:trace.topicMemory?{...trace.topicMemory,approvalToken:null}:null};
        setTrace(next);sessionStorage.setItem(TRACE_KEY,JSON.stringify(next));}
      setReload(n=>n+1);
    }catch(error){
      setCommitMessage(error instanceof Error?error.message:"Commit rejected");
      if(trace){const next={...trace,topicMemory:trace.topicMemory?{...trace.topicMemory,approvalToken:null}:null};
        setTrace(next);sessionStorage.setItem(TRACE_KEY,JSON.stringify(next));}
    }finally{setApproveChecked(false);setCommitBusy(false);}
  }
  useEffect(()=>{
    try{
      const raw=sessionStorage.getItem(TRACE_KEY);
      if(raw){const t=JSON.parse(raw) as TurnTrace;if(t.schema==="myway-v37c2-turn-trace-v1")setTrace(t);}
      const rows=JSON.parse(sessionStorage.getItem(METRICS_KEY)||"[]") as unknown;
      setHistory(Array.isArray(rows)?rows.filter((r):r is MetricRow=>Boolean(r)&&typeof r==="object"&&typeof (r as MetricRow).totalMs==="number"):[]);
    }
    catch{/* Ignore malformed session trace. */}
  },[reload]);
  // A topic selected in the 3D scene opens directly in this inspector.
  useEffect(()=>{
    const topic=new URLSearchParams(window.location.search).get("topic");
    if(topic) setSelection(topic);
  },[]);
  useEffect(()=>{
    let mounted=true;
    (async()=>{try{
      const r=await fetch("/api/sandbox/probe-lab/learning-space/readonly",{cache:"no-store"});
      if(!r.ok)throw Error(`Snapshot HTTP ${r.status}`);
      const result=await r.json() as WorkbenchSnapshot;
      if(result.schema!=="myway-v37c1-learning-space-readonly-v1"||result.mode!=="read_only")throw Error("Unexpected snapshot");
      if(mounted){setData(result);setFailure(null);}
    }catch(e){if(mounted)setFailure(e instanceof Error?e.message:"Snapshot unavailable");}})();
    return()=>{mounted=false;};
  },[reload]);
  const cost=trace?calculateTurnCost(trace):null;
  const topic=data?.inspect.find(t=>t.topicId===selection)??null;
  const metrics=[
    ["Topics",data?.summary.topicCount],["Label vectors",data?.summary.labelVectors],
    ["Message vectors",data?.summary.messageVectors],["Relationships",data?.summary.relationshipCount],
    ["Committed positions",data?.summary.committedPositions],["Semantic positions",data?.summary.semanticPositions]
  ];
  return <main className="min-h-screen bg-[radial-gradient(ellipse_at_8%_0%,rgba(109,63,192,0.18),transparent_42%),radial-gradient(ellipse_at_90%_12%,rgba(41,103,198,0.14),transparent_42%),linear-gradient(135deg,#090b1e,#0b1530_60%,#0c1025)] px-5 py-7 text-blue-50 md:px-10">
    <div className="mx-auto max-w-7xl">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200">MyWay · Experimental · Approved memory writes only</div>
        <h1 className="text-3xl font-semibold">Learning Space Workbench</h1>
        <p className="mt-2 text-sm text-blue-200/65">Diagnostics and model recommendations are read-only. Explicitly reviewed associations and session-opted score observations use guarded sandbox writes.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Sandbox view navigation" className="inline-flex items-center gap-1 rounded-xl border border-indigo-300/20 bg-[#171c3e]/70 p-1 text-sm">
            <Link className="rounded-lg px-3 py-2 text-blue-200 transition hover:bg-indigo-400/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300" href={`/sandbox/probe-lab/learning-space${selection ? `?topic=${encodeURIComponent(selection)}` : ""}`}>Learning Space</Link>
            <span aria-current="page" className="rounded-lg bg-gradient-to-r from-violet-600/45 to-blue-600/40 px-3 py-2 font-semibold text-white">Workbench</span>
          </nav>
          <button type="button" onClick={()=>setReload(n=>n+1)} className="rounded-xl border border-blue-300/20 bg-blue-500/10 px-4 py-2 text-sm text-blue-100 transition hover:bg-blue-400/20">Refresh snapshot</button>
        </div>
      </header>
      {failure&&<p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-900/20 p-3">{failure}</p>}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{metrics.map(([label,value])=><div key={label} className="rounded-2xl border border-indigo-300/15 bg-gradient-to-br from-violet-500/[.075] to-blue-500/[.045] p-4"><p className="text-xs text-blue-200/60">{label}</p><p className="mt-2 text-2xl font-semibold">{value??"—"}</p></div>)}</div>
      <div className="grid gap-6 lg:grid-cols-[minmax(290px,1fr)_minmax(360px,1.5fr)]">
        <section className="rounded-2xl border border-indigo-300/15 bg-[#121933]/75 p-4">
          <h2 className="mb-3 text-lg font-semibold">Topic records</h2>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">{data?.inspect.map(t=><button type="button" key={t.topicId} onClick={()=>setSelection(t.topicId)}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${t.topicId===selection?"border border-violet-300/25 bg-gradient-to-r from-violet-500/20 to-blue-500/15 text-blue-50":"hover:bg-indigo-400/10"}`}>
            <div>{t.label}</div><div className="mt-1 text-xs text-blue-200/50">Score {t.learningScore.toFixed(2)} · {t.diagnosis.replaceAll("_"," ")}</div>
          </button>)}{!data&&<p className="text-blue-200/50">Reading experimental topics...</p>}</div>
        </section>
        <section className="rounded-2xl border border-indigo-300/15 bg-[#121933]/75 p-5">
          <h2 className="mb-3 text-lg font-semibold">Inspector</h2>
          {topic?.scoredObservations && (typeof topic.scoredObservations.confusionCount==="number"||typeof topic.scoredObservations.insightCount==="number")&&
            <p className="mb-3 rounded-lg border border-indigo-300/20 px-3 py-2 text-xs text-blue-100/80">
              Model-estimated observations (not mastery): confusion {topic.scoredObservations.confusionCount??0} scores · mean {topic.scoredObservations.confusion===null?"—":((topic.scoredObservations.confusion??0)*10).toFixed(1)}/10;
              insight {topic.scoredObservations.insightCount??0} scores · mean {topic.scoredObservations.insight===null?"—":((topic.scoredObservations.insight??0)*10).toFixed(1)}/10.
            </p>}
          {topic?.repairEligible && <div className="mb-4 space-y-2 rounded-xl border border-amber-400/25 bg-amber-900/15 p-3 text-xs">
            <p className="font-semibold text-amber-100">Approved-topic index repair</p>
            <p className="text-amber-100/80">This earlier D.2A-created topic has no label embedding. Generate its index and assign an initial position if missing. No learner evidence, mastery or existing positions are changed.</p>
            <label className="flex items-start gap-2"><input type="checkbox" checked={repairChecked} onChange={e=>setRepairChecked(e.target.checked)}/>I authorize this one index repair in my experimental Supabase database.</label>
            <button type="button" disabled={!repairChecked||repairBusy} onClick={()=>void repairMissingIndex(topic.topicId)} className="rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 disabled:opacity-40">{repairBusy?"Verifying...":"Repair this topic index once"}</button>
          </div>}
          {repairNotice&&<p role="status" className="mb-3 text-xs text-amber-100">{repairNotice}</p>}
          {topic?<dl className="grid grid-cols-[minmax(120px,1fr)_2fr] gap-x-5 gap-y-4 text-sm">
            {([
              ["Topic",topic.label],["ID",topic.topicId],["Diagnosis",topic.diagnosis],
              ["Understanding",topic.learningScore.toFixed(3)],["Confusion",topic.confusion.toFixed(3)],
              ["Insight",topic.insight.toFixed(3)],["Position",topic.position.join(", ")],
              ["Semantic target",topic.semanticPosition?.join(", ")??"Not available"],
              ["Position source",topic.positionSource],
              ["Topic-label embedding",`${topic.labelEmbeddingReady?"Ready":"Missing"} · ${topic.labelModel??"Unknown model"} · ${topic.labelCount} inputs`],
              ["Message embedding",`${topic.messageEmbeddingReady?"Ready":"Missing"} · ${topic.messageModel??"Unknown model"} · ${topic.messageCount} inputs`]
            ] as [string,string][]).map(([key,value])=><div key={key} className="contents"><dt className="text-blue-200/65">{key}</dt><dd className="break-words">{value}</dd></div>)}
          </dl>:<p className="text-blue-200/65">Select a topic to inspect its stored state and embedding metadata.</p>}
          <div className="mt-7 rounded-xl bg-indigo-400/[.07] p-4 text-xs text-blue-200/60">
            New D.2A topics initially save their label and evidence-backed root problem in topic_json. Null mastery/diagnosis fields and missing topic vectors or semantic coordinates are expected until a later dedicated enrichment/layout stage. No scores, embeddings, or 3D layout are fabricated on approval.
          </div>
        </section>
      </div>
      <section className="mt-6 rounded-2xl border border-indigo-300/15 bg-[#121933]/75 p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Latest learning turn</h2>
          <button type="button" onClick={()=>{sessionStorage.removeItem(TRACE_KEY);sessionStorage.removeItem(CLARIFICATION_KEY);setTrace(null);}} className="rounded-lg border border-blue-300/20 bg-blue-400/10 px-3 py-2 text-xs text-blue-100 transition hover:bg-blue-400/20">Clear session trace</button>
        </div>
        {trace? <div className="space-y-3 text-sm">
          <p><strong>Status:</strong> {trace.status} · Assessment: {trace.assessmentProvider} ({trace.assessmentModel??"—"}) · Teaching: {trace.teachingProvider} ({trace.teachingModel??"—"})</p>
          <p><strong>Learner statement:</strong> {trace.message}</p>
          <p><strong>Evidence:</strong> {trace.assessment?.evidence_quote??"—"}</p>
          <p><strong>Root problem:</strong> {trace.assessment?.root_problem??"—"} <span className="text-blue-200/65">({trace.resolution??"unresolved"})</span></p>
          <p><strong>Confusion / Insight:</strong> {trace.assessment?.confusion??"—"} / {trace.assessment?.insight??"—"}; model-estimated evidence confidence {trace.assessment?.root_problem_confidence??"—"}</p>
          <p><strong>Retrieval:</strong> {trace.retrieval?.status??"Not attempted"} · {trace.retrieval?.matches.length??0} matches · {trace.retrieval?.model??"Model not used"} · Query: {trace.retrieval?.queryMode??"legacy"}</p>
          {trace.retrieval?.matches.map(m=><p key={m.topicId} className="ml-3 text-xs text-blue-100/80">{m.topicLabel} {trace.retrieval?.status==="semantic_pgvector"?`(${m.similarity.toFixed(3)})`:"(lexical, not similarity)"}</p>)}
          <section aria-label="Semantic association verifier" className="rounded-xl border border-sky-300/20 bg-sky-950/20 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Semantic association verifier</h3><span className="rounded-full border border-sky-400/25 px-2 py-0.5 text-xs text-sky-200">Shadow only · no write authority</span></div>
            <p className="text-xs text-blue-200/70">Selected model: {trace.verifierChoice??"—"} · Actual model: {trace.verifierModel??"Not run"} · {trace.timings.verifierMs??0} ms</p>
            <p><strong>Verifier:</strong> {trace.verifier?.status??"Not run"} {trace.verifier?.decision?`· ${trace.verifier.decision.relation.replaceAll("_"," ")}`:""}</p>
            {trace.verifier?.decision&&<div className="space-y-1 text-sm"><p><strong>Candidate topic ID:</strong> {trace.verifier.decision.target_topic_id||"None"}</p><p className="text-blue-100/85">{trace.verifier.decision.rationale}</p></div>}
            {trace.verifier?.error&&<p className="text-xs text-amber-200/80">{trace.verifier.error}</p>}
            <p className="text-xs text-blue-200/65">Model C is advisory: it never authorizes automatic writes. A human-reviewed association is checked again against the server-held retrieval snapshot and existing difficulty evidence.</p>
            {trace.verifier?.status==="complete" && trace.verifier.decision && ["same_topic_same_difficulty","same_topic_new_difficulty"].includes(trace.verifier.decision.relation) && trace.topicMemory?.reviewToken && <div className="mt-3 space-y-2 rounded-lg border border-amber-400/25 bg-amber-900/10 p-3">
              <p className="text-xs text-amber-100">Review Model C's proposed existing topic. This action appends scored evidence; it cannot create a topic or change mastery.</p>
              <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={reviewChecked} onChange={e=>setReviewChecked(e.target.checked)}/>I reviewed the topic ID, stored difficulty and learner evidence and approve one existing-topic update.</label>
              <button type="button" disabled={!reviewChecked||reviewBusy} onClick={()=>void approveVerifierMatch()} className="rounded-lg border border-amber-300/30 bg-amber-300/15 px-3 py-2 text-xs font-semibold disabled:opacity-40">{reviewBusy?"Validating...":"Approve reviewed association once"}</button>
            </div>}
            {reviewStatus&&<p role="status" className="rounded-lg bg-sky-400/10 p-2 text-xs text-sky-100">{reviewStatus}</p>}
          </section>
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-900/10 p-4 space-y-2">
            <h3 className="font-semibold text-blue-50">V3.7D.2C · Topic memory and scored evidence</h3>
            {trace.topicMemory?.schema === "myway-v37d1-memory-preview-v1" ? <>
              <p><strong>Proposed action:</strong> {trace.topicMemory.action.replaceAll("_"," ")} · {trace.topicMemory.reasonCode}</p>
              <p><strong>Automatic evidence update eligibility:</strong> {trace.topicMemory.autoEligible===true?"Eligible after session opt-in":"Not eligible for automatic association"}</p>
              <p><strong>Assessed topic label:</strong> {trace.assessment?.topic_name??"—"} {trace.topicMemory.action==="propose_new"?"(will be used as the new topic label)":"(candidate topic, not necessarily a database label)"}</p>
              <p className="text-xs text-blue-200/70">Subject matching and historical root-problem matching are distinct; legacy topics can receive new difficulty evidence without claiming they already contain that difficulty.</p>
              <p className="text-blue-100/80">{trace.topicMemory.rationale}</p>
              {trace.topicMemory.targetTopicId && <p>Target topic: <code>{trace.topicMemory.targetTopicId}</code></p>}
              <details className="rounded-lg border border-indigo-300/15 bg-indigo-950/20 p-2">
                <summary className="cursor-pointer select-none text-xs font-medium text-blue-100">Inspect {trace.topicMemory.candidates.length} retrieved candidate topics and their evidence</summary>
              {trace.topicMemory.candidates.map(c => <div key={c.topicId} className="rounded-lg border border-indigo-300/10 bg-indigo-950/30 p-3 text-xs space-y-1">
                <p className="font-semibold">{c.topicLabel} · {c.similarity === null ? "No semantic score" : `Semantic similarity ${c.similarity.toFixed(3)}`}</p>
                <p>Diagnosis: {c.diagnosis??"Not recorded"} · Comparison: {c.comparison.replaceAll("_"," ")} · Root-problem overlap: {c.rootProblemOverlap === null ? "Unknown" : c.rootProblemOverlap.toFixed(3)} · Difficulty semantic similarity: {typeof c.rootProblemSemanticSimilarity!=="number"?"Not measured":c.rootProblemSemanticSimilarity.toFixed(3)} · Topic-label evidence: {typeof c.topicLabelFit==="number"?c.topicLabelFit.toFixed(3):"Not recorded"}</p>
                {c.storedRootProblems.map((problem,i)=><p key={i} className="text-blue-200/75">Stored difficulty: {problem}</p>)}
              </div>)}
              </details>
              {trace.topicMemory.limitations.map((limit,i)=><p key={i} className="text-amber-200/80 text-xs">Limitation: {limit}</p>)}
            </> : <p className="text-xs text-blue-200/70">No topic-memory preview. Complete a new C.3/D.1 learning turn. Older traces do not contain this result.</p>}
            <p className="text-xs text-emerald-200/75">New topics still require one explicit approval. Strong existing-topic matches may save model-estimated confusion/insight evidence after an opt-in in Learning Space. No automatic creation or mastery updates.</p>
            {trace.topicMemory?.approvalToken && ["associate_existing","propose_new"].includes(trace.topicMemory.action) ?
              <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-3 space-y-3">
                <p className="text-sm font-semibold text-amber-100">Approve one sandbox database write</p>
                <p className="text-xs text-amber-100/80">{trace.topicMemory.action==="associate_existing"?"Append this learner's evidence to the matched topic.":"Create a new topic from this assessed difficulty."} This records the learner's evidence and valid 0–10 confusion/insight observations; new topic creation is never automatic.</p>
                <label className="flex items-start gap-2 text-xs text-amber-50"><input type="checkbox" checked={approveChecked} onChange={e=>setApproveChecked(e.target.checked)} />I authorize this one topic-memory change in the isolated myway_sandbox database.</label>
                <button type="button" disabled={!approveChecked||commitBusy} onClick={approveMemoryWrite}
                  className="rounded-md border border-amber-200/35 bg-amber-300/20 px-3 py-2 text-xs font-semibold text-amber-50 disabled:cursor-not-allowed disabled:opacity-40">
                  {commitBusy?"Verifying and writing...":"Approve and commit once"}</button>
              </div>:
              <p className="text-xs text-amber-200/75">No active approval: hold decision, expired/used capability, or older trace. Submit a new learning turn for a fresh preview.</p>}
            {commitMessage&&<p role="status" className={commitOk?"text-sm text-emerald-200":"text-sm text-amber-200"}>{commitMessage}</p>}
          </div>
          <section aria-label="Independent scored observation" className="rounded-xl border border-indigo-300/20 bg-indigo-950/20 p-3 text-xs">
            <p className="font-semibold">Independent confusion / insight observation</p>
            <p className="mt-1 text-blue-200/80">{trace.observationSave?.status??"Not collected"} · {trace.observationSave?.detail??"No independent score-store request was made."}</p>
            <p className="mt-1 text-blue-200/60">An unassigned observation does not alter a topic's scores, learning score, or sphere. Save requires session opt-in and the separate sandbox-only SQL table.</p>
          </section>
          <p><strong>Teaching:</strong> {trace.teaching?.teaching_strategy??(trace.status==="error"&&trace.failedStage==="teaching"?"Failed during teaching":trace.status==="teaching"?"In progress":"Not executed")}</p>
          <p><strong>Visual intent:</strong> {trace.teaching?.visual_intent??"Not generated"}</p>
          <p><strong>Frozen handoff:</strong> {trace.handoff?.schema_version??"None"} · Director {trace.handoff?.visual_stage??"not started"}</p>
          {trace.io&&<p className="text-xs text-blue-200/65"><strong>Model I/O:</strong> Assessment {trace.io.assessment?.promptChars??"—"} prompt / {trace.io.assessment?.outputChars??"—"} output characters; Teaching {trace.io.teaching?.promptChars??"—"} prompt / {trace.io.teaching?.outputChars??"—"} output characters. Tokens shown only when the provider reports usage.</p>}
          {cost&&<section className="mt-3 rounded-xl border border-indigo-300/20 bg-indigo-500/[.06] p-3 space-y-2" aria-label="Estimated API token cost">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Estimated model API cost · USD</h3>
              <strong className="text-lg">{cost.complete?formatUsd(cost.totalEstimatedUsd):cost.knownSubtotalUsd!==null?`Known subtotal ${formatUsd(cost.knownSubtotalUsd)}`:"Unavailable"}</strong></div>
            <CostBreakdown label="Assessment" info={cost.assessment}/>
            <CostBreakdown label="Teaching" info={cost.teaching}/>
            {cost.verifier&&<CostBreakdown label="Verifier (shadow)" info={cost.verifier}/>}
            <p className="text-[11px] text-blue-200/60">Calculated from provider-reported tokens using standard OpenAI rates as of 2026-10-27. Estimate only, not a billing receipt; excludes tax, currency conversion, other service charges and local computing. Unpriced GLM calls are never counted as free.</p>
          </section>}
          <p><strong>Stage time (ms):</strong> assessment {trace.timings.assessmentMs??"—"}, retrieval {trace.timings.retrievalMs??"—"}, verifier {trace.timings.verifierMs??"—"}, teaching {trace.timings.teachingMs??"—"}, total {trace.timings.totalMs??"—"}</p>
          {trace.failedStage&&<p role="alert" className="text-amber-200">Failure stage: {trace.failedStage}. The duration includes the failed attempt, not just successful model output.</p>}
          {trace.steps?.length ? <div className="mt-5 rounded-2xl border border-indigo-300/20 bg-[#0b1230]/65 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-blue-50">Learning-turn latency profiler</h3>
              <span className="text-xs text-blue-200/70">End-to-end {(trace.timings.totalMs??0)/1000}s · local browser clock</span></div>
            <p className="mb-4 text-xs text-blue-200/60">Bars show each browser step relative to total time. Server subtimings are nested inside retrieval and are not added twice. Cloud model timings include browser request and provider inference. GLM provider timing is nested; OpenAI and GLM provider token counts appear when reported; characters are not billing tokens.</p>
            <div className="space-y-3">{trace.steps.map((step,i)=>{
              const nested=step.id.startsWith("retrieval.server.");
              const fraction=Math.min(100,100*step.durationMs/Math.max(trace.timings.totalMs||1,1));
              return <div key={`${step.id}-${i}`} className={nested?"ml-4 border-l border-blue-400/20 pl-3":""}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-blue-100">{step.label}</span>
                  <span className={step.status==="failed"?"text-red-300":step.status==="fallback"?"text-amber-200":"text-blue-200/70"}>
                    {step.status} · {step.durationMs.toLocaleString()} ms</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-indigo-950/85"><div style={{width:`${fraction}%`}}
                  className={`h-full rounded-full ${step.status==="failed"?"bg-rose-400":step.status==="fallback"?"bg-amber-400":step.stage==="assessment"?"bg-violet-500":step.stage==="teaching"?"bg-blue-400":step.stage==="retrieval"?"bg-sky-400":"bg-indigo-300"}`}/></div>
                {step.detail&&<p className="mt-1 text-[11px] text-blue-200/50">{step.detail}</p>}
              </div>;
            })}</div>
          </div> : <p className="text-xs text-blue-200/55">Detailed timings are available for new V3.7C.2.3 turns.</p>}
          {trace.warnings.map((x,i)=><p key={i} className="text-violet-200">{x}</p>)}
          {trace.error&&<p role="alert" className="text-red-300">{trace.error}</p>}
          {trace.handoff&&<details className="rounded-lg border border-indigo-300/15 bg-indigo-400/[.06] p-3"><summary className="cursor-pointer">Inspect frozen visual handoff JSON</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(trace.handoff,null,2)}</pre></details>}
        </div>:<p className="text-blue-200/65">No learning-turn trace in this browser tab. Send a message from Learning Space, then return here.</p>}
      </section>
      <section className="mt-6 rounded-2xl border border-indigo-300/15 bg-[#121933]/75 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Session latency comparison</h2>
          <button type="button" onClick={()=>{sessionStorage.removeItem(METRICS_KEY);setHistory([]);}} className="rounded-lg border border-indigo-300/20 bg-indigo-400/10 px-3 py-2 text-xs text-blue-100">Clear metrics</button>
        </div>
        <p className="mt-2 text-xs text-blue-200/60">Up to 12 runs in this browser tab. Timing, provider, model ID, token-usage cost estimates and output-size metrics only; no learner messages or model responses are saved in this history. This is observational, not a speedup claim.</p>
        {history.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs">
          <thead><tr className="border-b border-indigo-200/20 text-blue-200/75"><th className="py-2">Run</th><th>Providers (A / B)</th><th>Models</th><th>Status</th><th className="text-right">Assess</th><th className="text-right">Retrieve</th><th className="text-right">Teach</th><th className="text-right">Total</th><th className="text-right">Est. API cost (USD)</th></tr></thead>
          <tbody>{history.slice().reverse().map((m,i)=><tr key={m.id} className="border-b border-indigo-200/10 text-blue-100/85">
            <td className="py-2">{history.length-i}</td><td>{m.assessmentProvider} / {m.teachingProvider}</td><td className="max-w-[230px] break-words text-[10px] text-blue-200/70">{m.assessmentModel??"—"} / {m.teachingModel??"—"}</td>
            <td>{m.status}{m.failedStage?` (${m.failedStage})`:""}</td><td className="text-right">{m.assessmentMs??"—"}</td>
            <td className="text-right">{m.retrievalMs??"—"}</td><td className="text-right">{m.teachingMs??"—"}</td><td className="text-right">{m.totalMs}</td><td className="text-right">{m.costComplete?formatUsd(m.costUsd??null):m.knownCostSubtotalUsd!=null?`≥ ${formatUsd(m.knownCostSubtotalUsd)}`:"—"}</td>
          </tr>)}</tbody>
        </table></div> : <p className="mt-3 text-xs text-blue-200/60">No V3.7C.2.2 measurements yet. Complete a learning turn to establish a baseline.</p>}
      </section>
      <p className="mt-6 text-xs text-blue-200/50">Snapshot: {data?.generatedAt??"Not loaded"} · No raw embedding values are exposed by the preview API.</p>
    </div>
  </main>;
}

"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {executeLearningTurn, TRACE_KEY, CLARIFICATION_KEY, saveMetricRow, type TurnTrace, type ModelChoice, MODEL_CHOICES} from "./learning-turn.client";
import type {ClarificationContext} from "./assessment-core";
import Link from "next/link";
import SpaceCanvas from "@/ui/learning-space/scene/canvas";
import Sidebar, { type SidebarTab } from "@/ui/learning-space/shell/sidebar";
import TopicPanel from "@/ui/learning-space/shell/topic-panel";
import BottomComposer from "@/ui/learning-space/shell/bottom-composer";
import { deriveProgressSummary } from "@/lib/learning-progress/derive-progress-summary";
import { buildLearningSpace } from "@/lib/learning-space/build-learning-space";
import type { Topic } from "@/types/topic";
import type { RelationshipViewMode } from "@/types/learning-space";
import type { LearningSpace } from "@/types/learning-space";

type Snapshot = {schema: string; source: string; mode: string; topics: Topic[]; learningSpace: LearningSpace;
  summary: {topicCount:number; labelVectors:number; messageVectors:number; relationshipCount:number}};

export default function LearningSpacePreview() {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [focused,setFocused]=useState<string|null>(null);
  const [tab,setTab]=useState<SidebarTab>("myway");
  const [mode,setMode]=useState<RelationshipViewMode>("semantic_similarity");
  const [leftOpen,setLeftOpen]=useState(true);
  const [rightOpen,setRightOpen]=useState(true);
  const [notice,setNotice]=useState("Assessment and teaching are enabled. Automatic scored evidence updates are off unless explicitly enabled for this tab; new topics still require approval.");
  const [assessmentChoice,setAssessmentChoice]=useState<ModelChoice>("edge");
  const [teachingChoice,setTeachingChoice]=useState<ModelChoice>("edge");
  const [verifierChoice,setVerifierChoice]=useState<ModelChoice>("openai:gpt-4.1-mini");
  const [running,setRunning]=useState(false);
  const [autoAssociate,setAutoAssociate]=useState(false);
  const [saveObservations,setSaveObservations]=useState(false); // per-tab, opt-in, never persisted
  const [autoStatus,setAutoStatus]=useState<string|null>(null);
  const [trace,setTrace]=useState<TurnTrace|null>(null);
  const [pending,setPending]=useState<ClarificationContext|null>(null);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>{
    try {
      const raw=sessionStorage.getItem(TRACE_KEY);
      if(raw){const candidate=JSON.parse(raw) as TurnTrace;if(candidate.schema==="myway-v37c2-turn-trace-v1") {setTrace(candidate);setNotice(candidate.reply);}}
      const hold=sessionStorage.getItem(CLARIFICATION_KEY);
      if(hold){const c=JSON.parse(hold) as ClarificationContext;if(c&&c.depth===1&&typeof c.originalMessage==="string")setPending(c);}
    }catch{/* Ignore stale session data. */}
    return ()=>{active.current?.abort();};
  },[]);
  const send=useCallback(async(message:string)=>{
    if(running||!message.trim())return;
    const controller=new AbortController();active.current=controller;setRunning(true);setAutoStatus(null);
    try {
      const outcome=await executeLearningTurn({message:message.slice(0,2500),context:pending,
       assessmentChoice,teachingChoice,verifierChoice,signal:controller.signal,onStage:t=>{
        if(controller.signal.aborted)return;
        setTrace(t);setNotice(t.reply);
        try{sessionStorage.setItem(TRACE_KEY,JSON.stringify(t));}catch{/* Session quota unavailable. */}
       }});
      if(controller.signal.aborted)return;
      let finalTrace=outcome.trace;
      // No new-topic automation. A fresh, high-bar semantic match may receive
      // one scored evidence update only after this tab opted in.
      if(autoAssociate && finalTrace.status==="complete" &&
         finalTrace.topicMemory?.action==="associate_existing" &&
         finalTrace.topicMemory?.autoEligible===true && finalTrace.topicMemory.approvalToken){
        const token=finalTrace.topicMemory.approvalToken;
        try{
          const saved=await fetch("/api/sandbox/probe-lab/learning-space/retrieve",{
            method:"POST",credentials:"same-origin",cache:"no-store",signal:controller.signal,
            headers:{"Content-Type":"application/json","X-MyWay-Approval":"v37d2c-auto"},
            body:JSON.stringify({operation:"auto_associate_existing",approvalToken:token,
              approvalPhrase:"I_ENABLED_AUTO_ASSOCIATION_THIS_SESSION"})});
          const result=await saved.json() as {status?:string;action?:string;topicId?:string;verified?:boolean;error?:string;code?:string};
          if(!saved.ok||result.status!=="committed"||result.action!=="associate_existing"||!result.verified)
            throw Error(result.error??`Auto-association HTTP ${saved.status}`);
          finalTrace={...finalTrace,topicMemory:finalTrace.topicMemory?{...finalTrace.topicMemory,approvalToken:null}:null};
          setAutoStatus(`Scored evidence saved to existing topic ${result.topicId}. No topic was created.`);
          if(result.topicId)setSelected(result.topicId);
          void fetch("/api/sandbox/probe-lab/learning-space/readonly",{cache:"no-store"})
            .then(r=>r.ok?r.json():Promise.reject(Error(`Snapshot HTTP ${r.status}`)))
            .then((snap:Snapshot)=>{if(snap.schema==="myway-v37c1-learning-space-readonly-v1")setSnapshot(snap);})
            .catch(()=>{});
        }catch(error){
          setAutoStatus(`Automatic update withheld: ${error instanceof Error?error.message:"unknown error"}`);
          finalTrace={...finalTrace,topicMemory:finalTrace.topicMemory?{...finalTrace.topicMemory,approvalToken:null}:null};
        }
      }
      // Independent, append-only evidence: separate sandbox table, no topic attribution or mastery writes.
      // This browser-tab checkbox is off by default. Failure must never block teaching.
      if(saveObservations && finalTrace.status==="complete" && finalTrace.assessment){
        const a=finalTrace.assessment;
        try{
          const res=await fetch("/api/sandbox/probe-lab/learning-space/retrieve",{
            method:"POST",cache:"no-store",credentials:"same-origin",signal:controller.signal,
            headers:{"Content-Type":"application/json","X-MyWay-Approval":"v37d2c2-observation","X-MyWay-Observation-Consent":"session-opt-in"},
            body:JSON.stringify({operation:"record_scored_observation",eventId:finalTrace.id,
              topicName:a.topic_name,rootProblem:a.root_problem,evidenceQuote:a.evidence_quote,
              originalMessage:pending?.originalMessage??finalTrace.message,currentMessage:finalTrace.message,
              confusion:a.confusion,insight:a.insight,rootConfidence:a.root_problem_confidence})});
          const record=await res.json() as {status?:string;error?:string;eventId?:string};
          if(!res.ok||!["recorded","duplicate"].includes(record.status??""))throw Error(record.error??`Observation HTTP ${res.status}`);
          finalTrace={...finalTrace,observationSave:{status:record.status as "recorded"|"duplicate",eventId:finalTrace.id,topicId:null,detail:"Unassigned until independently attributed; topic averages unchanged."}};
        }catch(error){
          finalTrace={...finalTrace,observationSave:{status:"error",detail:(error instanceof Error?error.message:"Unavailable").slice(0,180)}};
        }
      }else if(finalTrace.status==="complete"){
        finalTrace={...finalTrace,observationSave:{status:"withheld",detail:"Session opt-in is off. No independent observation was stored."}};
      }
      setTrace(finalTrace);setNotice(finalTrace.reply);
      try{sessionStorage.setItem(TRACE_KEY,JSON.stringify(finalTrace));}catch{}
      saveMetricRow(finalTrace);
      if(outcome.trace.retrieval?.status==="semantic_pgvector" && outcome.trace.retrieval.matches[0] && !finalTrace.topicMemory?.targetTopicId) setSelected(outcome.trace.retrieval.matches[0].topicId);
      if(finalTrace.topicMemory?.targetTopicId)setSelected(finalTrace.topicMemory.targetTopicId);
      setPending(outcome.nextClarification);
      if(outcome.nextClarification)sessionStorage.setItem(CLARIFICATION_KEY,JSON.stringify(outcome.nextClarification));
      else sessionStorage.removeItem(CLARIFICATION_KEY);
    } finally {setRunning(false);active.current=null;}
  },[running,pending,assessmentChoice,teachingChoice,verifierChoice,autoAssociate,saveObservations]);
  // Carry the selected topic across same-tab navigation from the Workbench.
  useEffect(()=>{
    const topic=new URLSearchParams(window.location.search).get("topic");
    if(topic) setSelected(topic);
  },[]);
  const refresh=useCallback(async()=>{
    setLoading(true);setError(null);
    try {
      const response=await fetch("/api/sandbox/probe-lab/learning-space/readonly",{cache:"no-store"});
      if(!response.ok)throw new Error(`Sandbox data request returned ${response.status}`);
      const data=await response.json() as Snapshot;
      if(data.schema!=="myway-v37c1-learning-space-readonly-v1"||data.mode!=="read_only")throw new Error("Unexpected data contract");
      setSnapshot(data);
    } catch(e){setError(e instanceof Error?e.message:"Read-only snapshot unavailable");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const topics=snapshot?.topics??[];
  const current=topics.find(t=>t.id===selected)??null;
  const learningSpace=useMemo(()=>snapshot?.learningSpace??buildLearningSpace([]),[snapshot]);
  const progress=useMemo(()=>deriveProgressSummary(topics,focused),[topics,focused]);
  return <main className="relative h-screen overflow-hidden bg-[#080b1c] text-white">
    <div className="absolute inset-0">
      <SpaceCanvas learningSpace={learningSpace} selectedTopicId={selected} focusedTopicId={focused}
        relationshipViewMode={mode} availableProbe={null} isEnteringProbe={false} probeEntryTopicId={null}
        onSelectTopic={id=>setSelected(id)} onFocusTopicChange={setFocused}
        onOpenProbe={()=>setNotice("Probe interaction is disabled during the read-only preview.")}
        onProbeEntryComplete={()=>{}} isBootstrappingTopics={loading}/>
    </div>
    <div className="pointer-events-none absolute left-0 top-0 z-40 h-full">
      <div className={`pointer-events-auto relative h-full w-70 rounded-r-[2rem] bg-gradient-to-r from-violet-950/20 via-indigo-950/10 to-transparent transform transition-transform duration-300 ${leftOpen?"translate-x-0":"-translate-x-[calc(100%-18px)]"}`}>
        <Sidebar activeTab={tab} onChangeTab={setTab} latestReply={notice} suggestedAction="Experimental inference · automatic association opt-in"
          isSending={running} progressSummary={progress} relationshipViewMode={mode} onChangeRelationshipViewMode={setMode}/>
        <button type="button" aria-label="Toggle MyWay panel" onClick={()=>setLeftOpen(v=>!v)}
          className="absolute right-0 top-1/2 rounded-r-xl border border-violet-300/20 bg-[#171b37]/90 px-1 py-5 text-[10px] text-blue-100 shadow-[0_4px_20px_rgba(76,66,180,0.18)]">{leftOpen?"‹":"›"}</button>
      </div>
    </div>
    {current&&<div className={`absolute right-0 top-0 z-40 hidden h-full w-90 bg-gradient-to-l from-blue-950/20 via-indigo-950/10 to-transparent transform transition-transform duration-300 xl:block ${rightOpen?"translate-x-0":"translate-x-[calc(100%-16px)]"}`}>
      <TopicPanel topic={current}/>
      <button type="button" aria-label="Toggle topic panel" onClick={()=>setRightOpen(v=>!v)}
        className="absolute left-0 top-1/2 rounded-l-xl border border-violet-300/20 bg-[#171b37]/90 px-1 py-5 text-[10px] text-blue-100 shadow-[0_4px_20px_rgba(76,66,180,0.18)]">{rightOpen?"›":"‹"}</button>
    </div>}
    <div className="pointer-events-none absolute left-1/2 top-2 z-50 flex max-w-[min(96vw,840px)] -translate-x-1/2 flex-wrap xl:left-[290px] xl:right-[380px] xl:max-w-none xl:translate-x-0 items-center justify-center gap-1.5 rounded-full border border-violet-300/20 bg-[#101630]/90 px-2 py-1 text-[10px] text-blue-100 shadow-[0_6px_24px_rgba(30,40,112,0.3)] backdrop-blur-xl">
      <span aria-label="Sandbox: opt-in automatic evidence updates only for strong same-topic matches" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-sky-400/25 bg-sky-400/10 px-2 py-1 font-semibold tracking-wide text-sky-200">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-sky-300"/>SANDBOX · GUARDED MEMORY WRITES
      </span>
      <nav aria-label="Sandbox view navigation" className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-indigo-300/15 bg-indigo-900/20 p-0.5">
        <span aria-current="page" className="rounded-full bg-gradient-to-r from-violet-600/45 to-blue-600/40 px-2.5 py-1 font-semibold text-white">Learning Space</span>
        <Link className="rounded-full px-2.5 py-1 text-blue-200/85 transition hover:bg-indigo-400/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300" href={`/sandbox/probe-lab/learning-space/workbench${selected ? `?topic=${encodeURIComponent(selected)}` : ""}`}>Workbench</Link>
      </nav>
      <span className="whitespace-nowrap px-1 text-blue-200/75">{snapshot?.summary.topicCount??0} topics</span>
      <button onClick={()=>void refresh()} type="button" className="pointer-events-auto rounded-full border border-blue-300/15 bg-blue-400/10 px-2.5 py-1 text-blue-100 transition hover:bg-blue-400/20">Refresh</button>
    </div>
    <div className="pointer-events-none absolute left-3 right-3 top-11 z-50 xl:left-[290px] xl:right-[380px]">
      <div className="pointer-events-auto mx-auto flex max-w-[960px] flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl border border-indigo-300/15 bg-[#111a34]/70 px-2 py-1 text-[10px] leading-4 text-blue-100 shadow-[0_5px_20px_rgba(15,23,80,0.18)] backdrop-blur-md">
        {([ ["Assessment",assessmentChoice,setAssessmentChoice], ["Teaching",teachingChoice,setTeachingChoice], ["Verifier",verifierChoice,setVerifierChoice] ] as const).map(([label,value,setValue])=><label key={label} className="flex min-w-0 items-center gap-1 whitespace-nowrap"><span className="text-blue-200/75">{label}</span><select aria-label={`${label} model`} value={value} disabled={running} onChange={e=>setValue(e.target.value as ModelChoice)} className="max-w-[158px] rounded-md border border-indigo-300/20 bg-[#1b2446]/90 px-1 py-0.5 text-[10px] text-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">{MODEL_CHOICES.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select></label>)}
        <label className="inline-flex items-center gap-1 rounded-md border border-amber-400/20 px-1.5 py-0.5" title="Existing-topic auto-save is restricted to proven deterministic matches; model C remains review-only.">
          <input type="checkbox" checked={autoAssociate} disabled={running} onChange={e=>setAutoAssociate(e.target.checked)}/><span>Auto-match (strict)</span>
        </label>
        <label className="inline-flex items-center gap-1 rounded-md border border-sky-400/20 px-1.5 py-0.5" title="Store validated 0–10 model-estimated scores as unassigned events in the separate sandbox table; requires SQL migration.">
          <input type="checkbox" checked={saveObservations} disabled={running} onChange={e=>setSaveObservations(e.target.checked)}/><span>Save score observations</span>
        </label>
        <span className="text-blue-200/60">{running?"Working":pending?"Clarify":"Ready"} · {trace?.retrieval?.status??"No search"}</span>
      </div>
    </div>
    {autoStatus&&<div role="status" className="pointer-events-auto absolute bottom-28 left-1/2 z-50 max-w-xl -translate-x-1/2 rounded-lg border border-sky-400/35 bg-[#101630]/95 px-4 py-2 text-xs text-sky-100">{autoStatus}</div>}
    {error&&<div role="alert" className="absolute left-1/2 top-24 z-50 -translate-x-1/2 rounded-xl border border-red-500/40 bg-[#32152f]/95 p-3 text-sm text-red-100 shadow-lg">{error}</div>}
    <div className="pointer-events-none absolute inset-x-3 bottom-4 z-40 flex justify-center xl:left-[310px] xl:right-[380px] xl:inset-x-auto">
      <div className="pointer-events-auto w-full max-w-4xl rounded-2xl border border-indigo-300/10 bg-gradient-to-r from-[#0d1230]/50 via-[#0d1230]/30 to-transparent p-2 shadow-[0_8px_40px_rgba(46,50,154,0.12)] backdrop-blur-[2px] xl:max-w-none">
        <p className="mb-2 text-center text-xs text-blue-100/75">Sandbox · New topics require approval · Memory updates are opt-in</p>
        <BottomComposer onSendMessage={send} isSending={running}/>
      </div>
    </div>
  </main>;
}
